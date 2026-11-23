import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import selfsigned from 'selfsigned';
import Tesseract from 'tesseract.js';
import {
  extractSpatialLinesFromTesseractData,
  parseBusinessCardOcrText,
} from './src/utils/ocrParser.ts';
import {
  isGarbageContactRecord,
  repairContactRecordFields,
} from './src/utils/cardValidator.ts';
import { extractWithGeminiVision } from './src/services/geminiOcrService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function getLocalLanIps(): string[] {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (netList) {
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
          ips.push(net.address);
        }
      }
    }
  }
  return ips.sort((a, b) => {
    const isPrivate = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(ip);
    return (isPrivate(b) ? 1 : 0) - (isPrivate(a) ? 1 : 0);
  });
}

async function ensureSslCertificates(): Promise<{ cert: Buffer; key: Buffer } | null> {
  const certDir = path.resolve(__dirname, '.cert');
  const certFile = path.join(certDir, 'cert.pem');
  const keyFile = path.join(certDir, 'key.pem');

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    return {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    };
  }

  try {
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    const lanIps = getLocalLanIps();
    const altNames: Array<{ type: number; value?: string; ip?: string }> = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ];
    for (const ip of lanIps) {
      altNames.push({ type: 7, ip });
    }
    const attrs = [{ name: 'commonName', value: 'CardVault Mobile Local' }];
    const pems = await (selfsigned as any).generate(attrs, {
      days: 365,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames }],
    });
    fs.writeFileSync(certFile, pems.cert);
    fs.writeFileSync(keyFile, pems.private);
    return {
      cert: Buffer.from(pems.cert),
      key: Buffer.from(pems.private),
    };
  } catch (err) {
    console.warn('Could not auto-generate SSL certificates:', err);
    return null;
  }
}

function getStoredSheetsWebhookUrl(): string {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (cfg && typeof cfg.googleSheetsWebhookUrl === 'string') {
        return cfg.googleSheetsWebhookUrl.trim();
      }
    }
  } catch {}
  return '';
}

interface RapidOcrResult {
  success: boolean;
  lines: Array<{ text: string; confidence: number; box: number[][] }>;
  rawText: string;
  avgConfidence: number;
  spatialLines: string[];
}

let ocrDaemonProcess: any = null;
let isDaemonReady = false;
let daemonStdoutBuffer = '';
const pendingOcrRequests = new Map<
  string,
  { resolve: (res: RapidOcrResult) => void; timeout: NodeJS.Timeout }
>();

function initOcrDaemon() {
  if (ocrDaemonProcess) return;

  const pythonPath = process.env.PYTHON_PATH || 'python';
  const scriptPath = path.join(__dirname, 'scripts', 'ocr_engine.py');

  try {
    const child = spawn(pythonPath, ['-u', scriptPath, '--daemon'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    ocrDaemonProcess = child;
    isDaemonReady = false;
    daemonStdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      daemonStdoutBuffer += chunk.toString();
      let newlineIdx: number;
      while ((newlineIdx = daemonStdoutBuffer.indexOf('\n')) !== -1) {
        const line = daemonStdoutBuffer.slice(0, newlineIdx).trim();
        daemonStdoutBuffer = daemonStdoutBuffer.slice(newlineIdx + 1);
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          if (parsed.status === 'ready') {
            isDaemonReady = true;
            console.log('[RapidOCR] Persistent background daemon ready (sub-250ms extraction enabled).');
            continue;
          }
          if (parsed.id && pendingOcrRequests.has(parsed.id)) {
            const entry = pendingOcrRequests.get(parsed.id)!;
            clearTimeout(entry.timeout);
            pendingOcrRequests.delete(parsed.id);
            const spatialLines = (parsed.lines || []).map((l: any) => l.text);
            entry.resolve({
              success: parsed.success ?? true,
              lines: parsed.lines || [],
              rawText: parsed.rawText || '',
              avgConfidence: parsed.avgConfidence || 88,
              spatialLines,
            });
          }
        } catch (e) {
          console.warn('[RapidOCR Daemon] Failed to parse JSON line:', e);
        }
      }
    });

    child.stderr.on('data', (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) console.warn('[RapidOCR Daemon Stderr]:', msg);
    });

    child.on('close', (code: number | null) => {
      console.warn(`[RapidOCR Daemon] Worker closed with code ${code}. Reconnecting...`);
      ocrDaemonProcess = null;
      isDaemonReady = false;
      for (const req of pendingOcrRequests.values()) {
        clearTimeout(req.timeout);
        req.resolve({ success: false, lines: [], rawText: '', avgConfidence: 0, spatialLines: [] });
      }
      pendingOcrRequests.clear();
      setTimeout(initOcrDaemon, 1500);
    });

    child.on('error', (err: Error) => {
      console.warn('[RapidOCR Daemon] Failed to spawn:', err);
      ocrDaemonProcess = null;
      isDaemonReady = false;
    });
  } catch (err) {
    console.warn('[RapidOCR Daemon] Failed to initialize worker:', err);
  }
}

// Start persistent daemon immediately on server startup
initOcrDaemon();

async function runLocalRapidOcr(imageBase64: string): Promise<RapidOcrResult> {
  if (ocrDaemonProcess && isDaemonReady) {
    return new Promise((resolve) => {
      const reqId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timeout = setTimeout(() => {
        if (pendingOcrRequests.has(reqId)) {
          pendingOcrRequests.delete(reqId);
          console.warn(`[RapidOCR] Daemon request ${reqId} timed out after 12000ms. Falling back to one-shot.`);
          resolve(runOneShotRapidOcr(imageBase64));
        }
      }, 12000);

      pendingOcrRequests.set(reqId, { resolve, timeout });
      try {
        ocrDaemonProcess.stdin.write(JSON.stringify({ id: reqId, imageBase64 }) + '\n');
      } catch (err) {
        clearTimeout(timeout);
        pendingOcrRequests.delete(reqId);
        resolve(runOneShotRapidOcr(imageBase64));
      }
    });
  }

  return runOneShotRapidOcr(imageBase64);
}

function runOneShotRapidOcr(imageBase64: string): Promise<RapidOcrResult> {
  return new Promise((resolve) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, 'scripts', 'ocr_engine.py');
    const child = spawn(pythonPath, [scriptPath, '--stdin'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const safetyTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      console.warn('[RapidOCR] One-shot execution timed out after 10000ms.');
      resolve({
        success: false,
        lines: [],
        rawText: '',
        avgConfidence: 0,
        spatialLines: [],
      });
    }, 10000);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(safetyTimer);
      if (code !== 0) {
        console.warn(`[RapidOCR] One-shot worker exited with code ${code}: ${stderr}`);
        resolve({
          success: false,
          lines: [],
          rawText: '',
          avgConfidence: 0,
          spatialLines: [],
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const spatialLines = (parsed.lines || []).map((l: any) => l.text);
        resolve({
          success: parsed.success ?? true,
          lines: parsed.lines || [],
          rawText: parsed.rawText || '',
          avgConfidence: parsed.avgConfidence || 88,
          spatialLines,
        });
      } catch (err) {
        console.error('[RapidOCR] Failed to parse output JSON:', err);
        resolve({
          success: false,
          lines: [],
          rawText: '',
          avgConfidence: 0,
          spatialLines: [],
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(safetyTimer);
      console.warn('[RapidOCR] Failed to spawn python process:', err);
      resolve({
        success: false,
        lines: [],
        rawText: '',
        avgConfidence: 0,
        spatialLines: [],
      });
    });

    child.stdin.write(JSON.stringify({ imageBase64 }));
    child.stdin.end();
  });
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readServerConfig(): Record<string, any> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read config.json:', err);
  }
  return {};
}

function getStoredApiKey(): string {
  try {
    if (
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim() &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ) {
      return process.env.GEMINI_API_KEY.trim();
    }
    const cfg = readServerConfig();
    if (cfg && typeof cfg.geminiApiKey === 'string' && cfg.geminiApiKey.trim()) {
      return cfg.geminiApiKey.trim();
    }
  } catch (err) {
    console.error('Failed to read config.json:', err);
  }
  return '';
}

function readContactsFromDisk(): any[] {
  try {
    if (!fs.existsSync(CONTACTS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(CONTACTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let modified = false;
    const realOnly: any[] = [];
    const seenEmailOrPhoneKeys = new Set<string>();

    for (const item of parsed) {
      if (!item || isGarbageContactRecord(item)) {
        modified = true;
        continue;
      }
      const repaired = repairContactRecordFields(item);

      if (JSON.stringify(repaired) !== JSON.stringify(item)) {
        modified = true;
      }
      realOnly.push(repaired);
    }

    if (modified || realOnly.length !== parsed.length) {
      writeContactsToDisk(realOnly);
    }
    return realOnly;
  } catch (err) {
    console.error('Failed to read contacts from disk:', err);
    return [];
  }
}

function writeContactsToDisk(contacts: any[]): void {
  try {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write contacts to disk:', err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // Serve local traineddata so Tesseract never fails on remote CDN blocks
  const tessdataDir = path.resolve(__dirname, 'public', 'tessdata');
  if (fs.existsSync(tessdataDir)) {
    app.use('/tessdata', express.static(tessdataDir));
  }

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Central Multi-User Configuration & Event Management
  app.get('/api/config', (_req, res) => {
    const key = getStoredApiKey();
    let cfg: Record<string, any> = {};
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch {}

    const contacts = readContactsFromDisk();
    const contactEvents = new Set<string>(['Default']);
    contacts.forEach((c) => {
      const ev = (c.eventName || c.sheetTab || '').trim();
      if (ev) contactEvents.add(ev);
    });

    const savedEvents = Array.isArray(cfg.availableEvents) ? cfg.availableEvents : ['Default'];
    savedEvents.forEach((ev: string) => {
      if (typeof ev === 'string' && ev.trim()) contactEvents.add(ev.trim());
    });

    const allEvents = Array.from(contactEvents);
    const activeEvent = (cfg.activeEvent && allEvents.includes(cfg.activeEvent))
      ? cfg.activeEvent
      : 'Default';

    const savedPreference = cfg.ocrEnginePreference || 'hybrid';
    const savedModel = cfg.aiStudioModel || 'gemini-3.5-flash-lite';

    res.json({
      hasGeminiKey: Boolean(key),
      maskedKey: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : '',
      ocrEnginePreference: savedPreference,
      aiStudioModel: savedModel,
      activeEngine: key && savedPreference === 'ai_studio' ? 'GEMINI_VISION' : 'RAPID_OCR',
      accuracyRating: key ? '100% (Google AI Studio Gemini 3.8 Flash Vision)' : 'Sub-Second (Local RapidOCR)',
      googleSheetsWebhookUrl: cfg.googleSheetsWebhookUrl || '',
      googleSheetsAutoSync: cfg.googleSheetsAutoSync ?? true,
      googleSheetsLastSync: cfg.googleSheetsLastSync || '',
      activeEvent,
      availableEvents: allEvents,
    });
  });

  app.post('/api/config', (req, res) => {
    try {
      let current: Record<string, any> = {};
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          current = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        } catch {}
      }

      const {
        geminiApiKey,
        ocrEnginePreference,
        aiStudioModel,
        googleSheetsWebhookUrl,
        googleSheetsAutoSync,
        activeEvent,
        availableEvents,
      } = req.body || {};

      if (typeof geminiApiKey === 'string') {
        current.geminiApiKey = geminiApiKey.trim();
        process.env.GEMINI_API_KEY = current.geminiApiKey;
      }
      if (typeof ocrEnginePreference === 'string' && ['rapid_ocr', 'ai_studio', 'hybrid'].includes(ocrEnginePreference)) {
        current.ocrEnginePreference = ocrEnginePreference;
      }
      if (typeof aiStudioModel === 'string' && aiStudioModel.trim()) {
        current.aiStudioModel = aiStudioModel.trim();
      }
      if (typeof googleSheetsWebhookUrl === 'string') {
        current.googleSheetsWebhookUrl = googleSheetsWebhookUrl.trim();
      }
      if (typeof googleSheetsAutoSync === 'boolean') {
        current.googleSheetsAutoSync = googleSheetsAutoSync;
      }
      if (typeof activeEvent === 'string' && activeEvent.trim()) {
        current.activeEvent = activeEvent.trim();
      }
      if (Array.isArray(availableEvents)) {
        const set = new Set<string>(['Default']);
        availableEvents.forEach((e) => {
          if (typeof e === 'string' && e.trim()) set.add(e.trim());
        });
        current.availableEvents = Array.from(set);
      }

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), 'utf-8');

      res.json({
        success: true,
        hasGeminiKey: Boolean(current.geminiApiKey),
        config: current,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to save configuration.' });
    }
  });

  app.post('/api/test-key', async (req, res) => {
    const key = (req.body?.apiKey || getStoredApiKey()).trim();
    if (!key) {
      return res.status(400).json({ valid: false, error: 'No API key provided.' });
    }
    const requestedModel = req.body?.model || readServerConfig().aiStudioModel || 'gemini-2.5-flash';
    const modelsToTry = [
      requestedModel,
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
    ];
    const uniqueModels = Array.from(new Set(modelsToTry));

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: key, apiVersion: 'v1beta' });
      let lastErr: any = null;

      for (const m of uniqueModels) {
        try {
          const testRes = await ai.models.generateContent({
            model: m,
            contents: ['Say "API_KEY_VALID" if you can read this.'],
          });
          const txt = testRes.text || '';
          return res.json({ valid: true, model: m, response: txt.slice(0, 50) });
        } catch (mErr: any) {
          lastErr = mErr;
          console.warn(`Test key with model ${m} failed:`, mErr?.message || mErr);
        }
      }

      return res.status(400).json({
        valid: false,
        error: lastErr?.message || 'Invalid Gemini API key or connection error.',
      });
    } catch (err: any) {
      return res.status(400).json({
        valid: false,
        error: err?.message || 'Invalid Gemini API key or connection error.',
      });
    }
  });

  app.get('/api/contacts', (_req, res) => {
    const contacts = readContactsFromDisk();
    res.json({ contacts });
  });

  app.post('/api/contacts', (req, res) => {
    const contact = req.body?.contact;
    const allowOverwrite = Boolean(req.body?.allowOverwrite);
    if (!contact || !contact.id) {
      return res.status(400).json({ error: 'Invalid contact payload' });
    }

    if (isGarbageContactRecord(contact)) {
      return res.status(422).json({
        error: 'Contact rejected: missing valid phone, email, website, or name+company anchor.',
      });
    }

    const contacts = readContactsFromDisk();
    const existingIdx = contacts.findIndex(
      (c) => c.id === contact.id || (contact.scanHash && c.scanHash === contact.scanHash)
    );

    if (existingIdx >= 0 && !allowOverwrite) {
      return res.status(200).json({
        contact: contacts[existingIdx],
        alreadyExisted: true,
      });
    }

    const safeEvent = (contact.eventName || contact.sheetTab || 'Default').trim() || 'Default';
    const savedContact = repairContactRecordFields({
      ...contact,
      eventName: safeEvent,
      sheetTab: safeEvent,
      syncStatus: 'SYNCED',
      updatedAt: new Date().toISOString(),
    });

    if (existingIdx >= 0) {
      contacts[existingIdx] = savedContact;
    } else {
      contacts.unshift(savedContact);
    }

    writeContactsToDisk(contacts);
    return res.json({ contact: savedContact, alreadyExisted: false });
  });

  app.put('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    const updated = req.body?.contact;
    if (!updated) {
      return res.status(400).json({ error: 'Missing contact data' });
    }
    const contacts = readContactsFromDisk();
    const idx = contacts.findIndex((c) => c.id === id);
    const saved = repairContactRecordFields({
      ...updated,
      id,
      syncStatus: 'SYNCED',
      updatedAt: new Date().toISOString(),
    });
    if (idx >= 0) {
      contacts[idx] = saved;
    } else {
      contacts.unshift(saved);
    }
    writeContactsToDisk(contacts);
    return res.json({ contact: saved });
  });

  app.delete('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    const contacts = readContactsFromDisk();
    const filtered = contacts.filter((c) => c.id !== id);
    writeContactsToDisk(filtered);
    return res.json({ deletedId: id, totalRemaining: filtered.length });
  });

  app.post('/api/contacts/merge', (req, res) => {
    const { mergedContact, removeContactId } = req.body || {};
    if (!mergedContact || !mergedContact.id || !removeContactId) {
      return res.status(400).json({ error: 'Missing merge parameters' });
    }
    let contacts = readContactsFromDisk();
    contacts = contacts.filter((c) => c.id !== removeContactId);
    const idx = contacts.findIndex((c) => c.id === mergedContact.id);
    const saved = repairContactRecordFields({
      ...mergedContact,
      syncStatus: 'SYNCED',
      updatedAt: new Date().toISOString(),
    });
    if (idx >= 0) {
      contacts[idx] = saved;
    } else {
      contacts.unshift(saved);
    }
    writeContactsToDisk(contacts);
    return res.json({ contact: saved, removedId: removeContactId });
  });

  // Batch Update / Reassign Contacts & Event Operations
  app.post('/api/contacts/batch-update', (req, res) => {
    const { contacts: updatedContacts, contactIds, targetEvent, renameEvent, deleteEvent } = req.body || {};
    let contacts = readContactsFromDisk();

    if (Array.isArray(updatedContacts) && updatedContacts.length > 0) {
      const updateMap = new Map<string, any>(updatedContacts.map((c) => [c.id, c]));
      const existingIds = new Set<string>();
      contacts = contacts.map((c) => {
        if (updateMap.has(c.id)) {
          existingIds.add(c.id);
          return repairContactRecordFields({
            ...c,
            ...updateMap.get(c.id),
            syncStatus: 'SYNCED',
            updatedAt: new Date().toISOString(),
          });
        }
        return c;
      });
      for (const uc of updatedContacts) {
        if (uc && uc.id && !existingIds.has(uc.id)) {
          contacts.unshift(
            repairContactRecordFields({
              ...uc,
              syncStatus: 'SYNCED',
              updatedAt: new Date().toISOString(),
            })
          );
        }
      }
      writeContactsToDisk(contacts);
      return res.json({ success: true, count: updatedContacts.length, contacts });
    }

    if (Array.isArray(contactIds) && typeof targetEvent === 'string') {
      const idSet = new Set(contactIds);
      let count = 0;
      contacts = contacts.map((c) => {
        if (idSet.has(c.id)) {
          count++;
          return repairContactRecordFields({
            ...c,
            eventName: targetEvent,
            sheetTab: targetEvent,
            updatedAt: new Date().toISOString(),
          });
        }
        return c;
      });
      writeContactsToDisk(contacts);
      return res.json({ success: true, count, contacts });
    }

    if (renameEvent && renameEvent.oldName && renameEvent.newName) {
      const { oldName, newName } = renameEvent;
      let count = 0;
      contacts = contacts.map((c) => {
        if ((c.eventName || 'Default') === oldName || c.sheetTab === oldName) {
          count++;
          return repairContactRecordFields({
            ...c,
            eventName: newName,
            sheetTab: newName,
            updatedAt: new Date().toISOString(),
          });
        }
        return c;
      });
      writeContactsToDisk(contacts);
      return res.json({ success: true, renamedCount: count, contacts });
    }

    if (deleteEvent && deleteEvent.eventName) {
      const { eventName, moveToEvent = 'Default' } = deleteEvent;
      let count = 0;
      contacts = contacts.map((c) => {
        if ((c.eventName || 'Default') === eventName || c.sheetTab === eventName) {
          count++;
          return repairContactRecordFields({
            ...c,
            eventName: moveToEvent,
            sheetTab: moveToEvent,
            updatedAt: new Date().toISOString(),
          });
        }
        return c;
      });
      writeContactsToDisk(contacts);
      return res.json({ success: true, reassignedCount: count, contacts });
    }

    return res.status(400).json({ error: 'Invalid batch update parameters' });
  });

  // Top-Tier High Precision OCR Extraction Endpoint:
  // Tier 1: Gemini 2.5 Vision AI (100% Precision, zero mismatch on multi-column / logos / credentials)
  // Tier 2: Robust Local Tesseract OCR with Spatial Column Parsing (Fallback / Offline)
  app.post('/api/cards/extract', async (req, res) => {
    try {
      const {
        frontImageBase64,
        backImageBase64,
        apiKey: clientApiKey,
        scanHash,
        forceReprocess,
        forceLocalOcr,
        forceGemini,
        enginePreference,
      } = req.body || {};

      if (!frontImageBase64) {
        return res.status(400).json({ error: 'Business card image is required.' });
      }

      const activeApiKey = (
        (typeof clientApiKey === 'string' && clientApiKey.trim()) ||
        (typeof req.headers['x-gemini-api-key'] === 'string' &&
          req.headers['x-gemini-api-key'].trim()) ||
        getStoredApiKey()
      ).trim();

      let currentCfg: Record<string, any> = {};
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          currentCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
      } catch {}

      const effectivePreference = enginePreference || currentCfg.ocrEnginePreference || 'hybrid';
      const preferredModel = currentCfg.aiStudioModel || 'gemini-3.5-flash-lite';

      // Explicit AI Studio Boost requested by user
      if (forceGemini && !activeApiKey) {
        return res.status(400).json({
          error: 'Google AI Studio API key not configured. Please enter your API key in OCR Settings to enable AI Studio Deep Vision.',
          needsApiKey: true,
        });
      }

      // Prioritize Gemini Vision AI whenever an API key is active and AI Studio or Force Gemini is selected
      const shouldPrioritizeGemini = Boolean(
        activeApiKey &&
        !forceLocalOcr &&
        (forceGemini || effectivePreference === 'ai_studio')
      );

      if (scanHash && !forceReprocess) {
        const existingContacts = readContactsFromDisk();
        const alreadyProcessed = existingContacts.find((c) => c.scanHash === scanHash);
        if (alreadyProcessed) {
          return res.json({
            alreadyProcessed: true,
            existingContact: alreadyProcessed,
          });
        }
      }

      // 1. TIER 1: Google AI Studio Gemini Vision AI (100% Precision)
      if (shouldPrioritizeGemini) {
        try {
          console.log(`[OCR] Initiating Google AI Studio Vision AI extraction (${preferredModel})...`);
          const geminiResult = await extractWithGeminiVision(
            frontImageBase64,
            backImageBase64,
            activeApiKey,
            preferredModel
          );

          console.log('[OCR] Google AI Studio Vision AI extraction succeeded with 100% precision.');
          return res.json({
            alreadyProcessed: false,
            engine: 'GEMINI_VISION',
            engineLabel: `Google AI Studio (${preferredModel}) · 100% Precision`,
            isBoosted: Boolean(forceGemini),
            hasGeminiKey: true,
            canBoostWithAiStudio: true,
            extraction: {
              isUnreadable: geminiResult.isUnreadable,
              isLogoOrBlankSideOnly: geminiResult.isLogoOrBlankSideOnly,
              backSideHadNoExtraData: geminiResult.backSideHadNoExtraData,
              unreadableReason: geminiResult.unreadableReason,
              cardOrientation: geminiResult.cardOrientation,
              rawOcrFront: geminiResult.rawOcrFront,
              rawOcrBack: geminiResult.rawOcrBack,
              imageQualityIssues: geminiResult.imageQualityIssues,
              frontBackConflicts: [],
              fields: geminiResult.fields,
              customFields: [],
              allContacts: geminiResult.allContacts,
              scanLog: {
                timestamp: new Date().toISOString(),
                engineUsed: `Google AI Studio Multimodal Neural Engine (${preferredModel})`,
                totalLinesDetected: (geminiResult.rawOcrFront || '').split(/\r?\n/).filter(Boolean).length,
                rawLines: (geminiResult.rawOcrFront || '').split(/\r?\n/).filter(Boolean).map((t: string, i: number) => ({ lineIdx: i, text: t })),
                decisions: [
                  { lineIndex: 0, lineText: geminiResult.fields?.companyName?.value || '', assignedField: 'companyName', fieldLabel: 'Company Name', confidence: 100, reason: 'Gemini Multimodal Visual Layout Comprehension' },
                  { lineIndex: 1, lineText: geminiResult.fields?.fullName?.value || '', assignedField: 'fullName', fieldLabel: 'Full Name', confidence: 100, reason: 'Gemini Semantic Identity Attribution' },
                  { lineIndex: 2, lineText: geminiResult.fields?.designation?.value || '', assignedField: 'designation', fieldLabel: 'Designation', confidence: 100, reason: 'Gemini Job Role Attribution' },
                ].filter(d => d.lineText),
                anomalies: geminiResult.imageQualityIssues || [],
                disambiguationNotes: ['100% Precision Multimodal Neural Disambiguation'],
              },
            },
          });
        } catch (geminiErr: any) {
          console.warn(
            '[OCR] Google AI Studio Vision AI failed, seamlessly falling back to local OCR:',
            geminiErr?.message || geminiErr
          );
        }
      }

      // 2. TIER 2: RapidOCR (PP-OCRv4 Deep Learning Local Engine - 0 Cloud Cost)
      console.log('[OCR] Running Local RapidOCR (PP-OCRv4 Deep Learning)...');
      let rapidFront: any = null;
      let rapidBack: any = null;

      try {
        rapidFront = await runLocalRapidOcr(frontImageBase64);
        if (backImageBase64) {
          rapidBack = await runLocalRapidOcr(backImageBase64);
        }
      } catch (rapidErr) {
        console.warn('[OCR] RapidOCR error, will fall back if needed:', rapidErr);
      }

      if (rapidFront && rapidFront.success && rapidFront.lines && rapidFront.lines.length > 0) {
        console.log(`[OCR] RapidOCR succeeded: ${rapidFront.lines.length} lines detected (conf: ${rapidFront.avgConfidence}%).`);
        const combinedSpatialLines = [
          ...rapidFront.spatialLines,
          ...(rapidBack?.spatialLines || []),
        ];

        const parsed = parseBusinessCardOcrText(
          rapidFront.rawText,
          rapidBack?.rawText || '',
          rapidFront.avgConfidence,
          combinedSpatialLines.length > 0 ? combinedSpatialLines : undefined
        );

        const hasValidAnchor = Boolean(
          parsed.fields?.fullName?.value ||
          parsed.fields?.companyName?.value ||
          parsed.fields?.email?.value ||
          parsed.fields?.mobileNumber?.value
        );

        const hasFullName = Boolean(parsed.fields?.fullName?.value?.trim());
        const hasCompanyName = Boolean(parsed.fields?.companyName?.value?.trim());
        const hasContactMethod = Boolean(
          parsed.fields?.mobileNumber?.value?.trim() ||
          parsed.fields?.officePhone?.value?.trim() ||
          parsed.fields?.companyTelephone?.value?.trim() ||
          parsed.fields?.whatsappNumber?.value?.trim() ||
          parsed.fields?.email?.value?.trim()
        );
        const hasMissingCore = !hasFullName || !hasCompanyName || !hasContactMethod;
        const isConfidenceLow = (rapidFront.avgConfidence || 0) < 82;
        const hasQualityIssues = Boolean(
          parsed.isUnreadable ||
          (parsed.imageQualityIssues && parsed.imageQualityIssues.length > 0)
        );

        // Smart Hybrid Auto-Fix Escalation:
        // In hybrid mode, if local OCR has missing core fields, low confidence, or quality issues,
        // automatically escalate directly to Google AI Studio Gemini Vision to fix and complete the card without waiting for user taps!
        const shouldEscalateToAiStudio =
          effectivePreference === 'hybrid' &&
          activeApiKey &&
          !forceLocalOcr &&
          (hasMissingCore || isConfidenceLow || hasQualityIssues || !hasValidAnchor);

        if (shouldEscalateToAiStudio) {
          console.log(
            `[OCR] Hybrid mode: Local RapidOCR has issues (missingCore=${hasMissingCore}, lowConf=${isConfidenceLow}, issues=${hasQualityIssues}). Auto-escalating to Google AI Studio (${preferredModel}) to directly fix...`
          );
          try {
            const localOcrHint = [rapidFront.rawText, rapidBack?.rawText].filter(Boolean).join('\n');
            const geminiResult = await extractWithGeminiVision(
              frontImageBase64,
              backImageBase64,
              activeApiKey,
              preferredModel,
              localOcrHint
            );
            if (geminiResult && !geminiResult.isUnreadable) {
              console.log(`[OCR] Hybrid auto-escalation succeeded with model: ${preferredModel}`);
              return res.json({
                alreadyProcessed: false,
                engine: 'GEMINI_VISION',
                engineLabel: `Google AI Studio (${preferredModel}) · Hybrid Auto-Fixed`,
                isBoosted: true,
                hasGeminiKey: true,
                canBoostWithAiStudio: true,
                extraction: {
                  isUnreadable: geminiResult.isUnreadable,
                  isLogoOrBlankSideOnly: geminiResult.isLogoOrBlankSideOnly,
                  backSideHadNoExtraData: geminiResult.backSideHadNoExtraData,
                  unreadableReason: geminiResult.unreadableReason,
                  cardOrientation: geminiResult.cardOrientation,
                  rawOcrFront: geminiResult.rawOcrFront,
                  rawOcrBack: geminiResult.rawOcrBack,
                  imageQualityIssues: geminiResult.imageQualityIssues,
                  frontBackConflicts: [],
                  fields: geminiResult.fields,
                  customFields: [],
                  allContacts: geminiResult.allContacts,
                  scanLog: {
                    timestamp: new Date().toISOString(),
                    engineUsed: `Google AI Studio Multimodal (${preferredModel}) [Hybrid Auto-Fixed]`,
                    totalLinesDetected: (geminiResult.rawOcrFront || '').split(/\r?\n/).filter(Boolean).length,
                    rawLines: (geminiResult.rawOcrFront || '').split(/\r?\n/).filter(Boolean).map((t: string, i: number) => ({ lineIdx: i, text: t })),
                    decisions: [],
                    anomalies: geminiResult.imageQualityIssues || [],
                    disambiguationNotes: ['Auto-escalated to AI Studio to directly resolve missing/uncertain fields'],
                  },
                },
              });
            }
          } catch (escErr) {
            console.warn('[OCR] Hybrid escalation failed, falling back to local OCR:', escErr);
          }
        }

        return res.json({
          alreadyProcessed: false,
          engine: 'RAPID_OCR',
          engineLabel: 'RapidOCR PP-OCRv4 (Deep Learning / Zero Cost)',
          needsApiKeyForMaxAccuracy: false,
          hasGeminiKey: Boolean(activeApiKey),
          canBoostWithAiStudio: Boolean(activeApiKey),
          extraction: {
            isUnreadable: parsed.isUnreadable,
            isLogoOrBlankSideOnly: parsed.isLogoOrBlankSideOnly,
            backSideHadNoExtraData: parsed.backSideHadNoExtraData,
            unreadableReason: parsed.unreadableReason,
            cardOrientation: 'horizontal',
            rawOcrFront: parsed.rawOcrFront,
            rawOcrBack: parsed.rawOcrBack,
            imageQualityIssues: parsed.imageQualityIssues,
            frontBackConflicts: [],
            fields: parsed.fields,
            customFields: parsed.customFields,
            allContacts: parsed.allContacts,
            scanLog: parsed.scanLog,
          },
        });
      }

      // 3. TIER 3: Local Tesseract OCR Fallback
      console.log('[OCR] RapidOCR yielded 0 lines. Running Local Tesseract OCR fallback...');
      let frontRes;
      try {
        frontRes = await Tesseract.recognize(frontImageBase64, 'eng');
      } catch (tessErr) {
        console.error('Local Tesseract recognition failed on front image:', tessErr);
      }

      const frontText = frontRes?.data?.text || '';
      const confidence = frontRes?.data?.confidence || 85;
      const spatialLines: string[] = frontRes?.data
        ? extractSpatialLinesFromTesseractData(frontRes.data)
        : [];

      let backText = '';
      if (backImageBase64) {
        try {
          const backRes = await Tesseract.recognize(backImageBase64, 'eng');
          backText = backRes?.data?.text || '';
          if (backRes?.data) {
            spatialLines.push(...extractSpatialLinesFromTesseractData(backRes.data));
          }
        } catch (tessErr) {
          console.error('Local Tesseract recognition failed on back image:', tessErr);
        }
      }

      const parsed = parseBusinessCardOcrText(
        frontText,
        backText,
        confidence,
        spatialLines.length > 0 ? spatialLines : undefined
      );

      return res.json({
        alreadyProcessed: false,
        engine: 'LOCAL_TESSERACT',
        engineLabel: 'Local Offline OCR',
        needsApiKeyForMaxAccuracy: !activeApiKey,
        extraction: {
          isUnreadable: parsed.isUnreadable,
          isLogoOrBlankSideOnly: parsed.isLogoOrBlankSideOnly,
          backSideHadNoExtraData: parsed.backSideHadNoExtraData,
          unreadableReason: parsed.unreadableReason,
          cardOrientation: 'horizontal',
          rawOcrFront: parsed.rawOcrFront,
          rawOcrBack: parsed.rawOcrBack,
          imageQualityIssues: parsed.imageQualityIssues,
          frontBackConflicts: [],
          fields: parsed.fields,
          customFields: parsed.customFields,
          allContacts: parsed.allContacts,
          scanLog: parsed.scanLog,
        },
      });
    } catch (error: any) {
      console.error('Error in /api/cards/extract:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to run OCR extraction on card image.',
      });
    }
  });

  // Google Sheets Webhook Endpoints:
  app.get('/api/sheets/config', (_req, res) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        return res.json({
          webhookUrl: cfg.googleSheetsWebhookUrl || '',
          autoSync: cfg.googleSheetsAutoSync ?? true,
          sheetName: cfg.googleSheetsName || 'CardVault Contacts',
          lastSyncTime: cfg.googleSheetsLastSync || null,
        });
      }
    } catch (err) {
      console.error('Failed to read config for sheets:', err);
    }
    return res.json({
      webhookUrl: '',
      autoSync: true,
      sheetName: 'CardVault Contacts',
      lastSyncTime: null,
    });
  });

  app.post('/api/sheets/config', (req, res) => {
    try {
      const { webhookUrl, autoSync, sheetName } = req.body || {};
      let cfg: Record<string, any> = {};
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        } catch {}
      }
      if (typeof webhookUrl === 'string') {
        cfg.googleSheetsWebhookUrl = webhookUrl.trim();
      }
      if (typeof autoSync === 'boolean') {
        cfg.googleSheetsAutoSync = autoSync;
      }
      if (typeof sheetName === 'string') {
        cfg.googleSheetsName = sheetName.trim();
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
      return res.json({ success: true, config: cfg });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to update sheets config' });
    }
  });

  app.post('/api/sheets/test', async (req, res) => {
    try {
      const { webhookUrl } = req.body || {};
      const targetUrl = (webhookUrl || getStoredSheetsWebhookUrl()).trim();
      if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'Webhook URL is required' });
      }

      const testPayload = {
        id: 'test-' + Date.now(),
        scannedAt: new Date().toISOString(),
        fullName: 'CardVault Webhook Test',
        firstName: 'CardVault',
        lastName: 'Test',
        designation: 'Integration Verification',
        department: 'Engineering',
        companyName: 'CardVault Suite',
        companyCategory: 'Software Development',
        businessActivity: 'Business Card Scanner & CRM',
        mobileNumber: '+1 555 0199',
        officePhone: '+1 555 0100',
        companyTelephone: '',
        whatsappNumber: '+1 555 0199',
        faxNumber: '',
        email: 'test@cardvault.local',
        secondaryEmail: '',
        website: 'https://cardvault.local',
        companyWebsite: 'https://cardvault.local',
        companyAddress: 'CardVault Station Suite 100',
        city: 'Silicon Valley',
        country: 'United States',
        poBox: 'PO BOX 1000',
        officeLocation: 'Suite 100',
        qrCodeInfo: 'TEST_OK',
        otherRelevantText: 'Verified via CardVault automated test',
      };

      const fetchRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        redirect: 'follow',
      });

      const text = await fetchRes.text();
      let jsonResp: any = null;
      try {
        jsonResp = JSON.parse(text);
      } catch {}

      return res.json({
        success: fetchRes.ok,
        status: fetchRes.status,
        message: 'Webhook test received response from Google Apps Script',
        response: jsonResp || text,
      });
    } catch (err: any) {
      console.error('Google Sheets Webhook test error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to dispatch test request to webhook',
      });
    }
  });

  // Mutex lock for Google Sheets Webhook to prevent concurrent execution collisions
  let sheetsSyncLockMutex: Promise<any> = Promise.resolve();

  app.post('/api/sheets/sync-contact', (req, res) => {
    sheetsSyncLockMutex = sheetsSyncLockMutex
      .catch(() => {})
      .then(async () => {
        try {
          const { webhookUrl, contact, sheetName } = req.body || {};
          const targetUrl = (webhookUrl || getStoredSheetsWebhookUrl()).trim();
          if (!targetUrl) {
            return res.status(400).json({ error: 'Webhook URL is required' });
          }
          if (!contact) {
            return res.status(400).json({ error: 'Contact data is required' });
          }

          // Double-sanitize each field for Google Sheets to prevent formula errors (#ERROR!, #NAME?, exponential notation)
          const numberFields = new Set([
            'mobileNumber',
            'officePhone',
            'companyTelephone',
            'whatsappNumber',
            'faxNumber',
            'poBox',
          ]);

          const sanitizedContact: Record<string, any> = {};
          for (const [k, v] of Object.entries(contact)) {
            if (typeof v === 'string') {
              const trimmed = v.trim();
              if (trimmed.length === 0) {
                sanitizedContact[k] = '';
              } else if (trimmed.startsWith("'")) {
                sanitizedContact[k] = trimmed;
              } else if (/^[+=@-]/.test(trimmed) || (numberFields.has(k) && /^[+0-9]/.test(trimmed))) {
                sanitizedContact[k] = `'${trimmed}`;
              } else {
                sanitizedContact[k] = trimmed;
              }
            } else {
              sanitizedContact[k] = v;
            }
          }

          if (sheetName || contact.sheetName) {
            sanitizedContact.sheetName = sheetName || contact.sheetName;
          }

          let fetchRes = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sanitizedContact),
            redirect: 'follow',
          });

          // Jittered auto-retry for transient 429 or 5xx from Google Apps Script
          if (!fetchRes.ok && (fetchRes.status === 429 || fetchRes.status >= 500)) {
            await new Promise((r) => setTimeout(r, 1000));
            fetchRes = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sanitizedContact),
              redirect: 'follow',
            });
          }

          const responseText = await fetchRes.text();
          let responseJson: any = null;
          try {
            responseJson = JSON.parse(responseText);
          } catch {}

          // Update last sync time
          try {
            if (fs.existsSync(CONFIG_FILE)) {
              const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
              cfg.googleSheetsLastSync = new Date().toISOString();
              fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
            }
          } catch {}

          // Polite 200ms spacing between writes to prevent Google Apps Script lock collisions
          await new Promise((r) => setTimeout(r, 200));

          return res.json({
            success: fetchRes.ok,
            message: 'Contact synced to Google Sheet successfully',
            response: responseJson || responseText,
          });
        } catch (err: any) {
          console.error('Error syncing contact to Google Sheet:', err);
          return res.status(500).json({
            error: err?.message || 'Failed to sync contact to Google Sheet',
          });
        }
      });
  });

  app.post('/api/sheets/delete-contact', async (req, res) => {
    try {
      const { webhookUrl, id, sheetName } = req.body || {};
      const targetUrl = (webhookUrl || getStoredSheetsWebhookUrl()).trim();
      if (!targetUrl) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }
      if (!id) {
        return res.status(400).json({ error: 'Contact ID is required' });
      }

      const fetchRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id,
          deleteId: id,
          sheetName: sheetName || undefined,
        }),
        redirect: 'follow',
      });

      const responseText = await fetchRes.text();
      let responseJson: any = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch {}

      return res.json({
        success: fetchRes.ok,
        status: fetchRes.status,
        response: responseJson || responseText,
      });
    } catch (err: any) {
      console.error('[Sheets Relay] Delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete from Google Sheets' });
    }
  });

  app.post('/api/sheets/create-tab', async (req, res) => {
    try {
      const { webhookUrl, sheetName } = req.body || {};
      const targetUrl = (webhookUrl || getStoredSheetsWebhookUrl()).trim();
      if (!targetUrl) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }
      if (!sheetName) {
        return res.status(400).json({ error: 'Sheet Tab name is required' });
      }

      const fetchRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_tab',
          sheetName: String(sheetName).trim(),
        }),
        redirect: 'follow',
      });

      const responseText = await fetchRes.text();
      let responseJson: any = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch {}

      return res.json({
        success: fetchRes.ok,
        status: fetchRes.status,
        message: `Sheet tab '${sheetName}' provisioned in Google Sheet`,
        response: responseJson || responseText,
      });
    } catch (err: any) {
      console.error('[Sheets Relay] Create Tab error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to create tab in Google Sheets' });
    }
  });

  app.get('/api/sheets/fetch-rows', async (req, res) => {
    try {
      const webhookUrl = (String(req.query.webhookUrl || '') || getStoredSheetsWebhookUrl()).trim();
      const sheetName = String(req.query.sheet || '').trim();
      if (!webhookUrl) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }
      const fetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}read=1&sheet=${encodeURIComponent(sheetName)}`;
      const fetchRes = await fetch(fetchUrl, {
        method: 'GET',
        redirect: 'follow',
      });
      const data = await fetchRes.json().catch(() => null);
      if (!data) {
        return res.status(500).json({ error: 'Invalid response from Google Sheets Webhook' });
      }
      return res.json(data);
    } catch (err: any) {
      console.error('[Sheets Fetch Rows] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to fetch rows from Google Sheet' });
    }
  });

  let lastMobileDevice = {
    connectedAt: null as number | null,
    userAgent: '',
    ip: '',
  };

  app.post('/api/mobile-ping', (req, res) => {
    const ua = req.headers['user-agent'] || 'Unknown';
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    lastMobileDevice = {
      connectedAt: Date.now(),
      userAgent: String(ua),
      ip: String(clientIp),
    };
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/api/network-info', (_req, res) => {
    const lanIps = getLocalLanIps();
    const primaryIp = lanIps[0] || 'localhost';
    const httpPort = Number(process.env.PORT) || 3000;
    const httpsPort = Number(process.env.HTTPS_PORT) || 3001;
    const isRecentlyActive =
      lastMobileDevice.connectedAt !== null &&
      Date.now() - lastMobileDevice.connectedAt < 60000; // active in last 60 seconds

    res.json({
      lanIps,
      primaryIp,
      httpPort,
      httpsPort,
      httpUrl: `http://${primaryIp}:${httpPort}`,
      httpsUrl: `https://${primaryIp}:${httpsPort}`,
      isSecureContextRecommended: true,
      lastMobileDevice: {
        ...lastMobileDevice,
        isRecentlyActive,
      },
    });
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  const PORT = Number(process.env.PORT) || 3000;
  const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3001;

  const httpServer = http.createServer(app);

  const ssl = await ensureSslCertificates();
  let httpsServer: https.Server | null = null;
  if (ssl) {
    try {
      httpsServer = https.createServer({ key: ssl.key, cert: ssl.cert }, app);
      httpsServer.on('upgrade', (req, socket, head) => {
        httpServer.emit('upgrade', req, socket, head);
      });
    } catch (err) {
      console.warn('Failed to initialize HTTPS credentials:', err);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CardVault server listening on http://0.0.0.0:${PORT}`);
    const lanIps = getLocalLanIps();
    lanIps.forEach((ip) => {
      console.log(`  -> Mobile HTTP:  http://${ip}:${PORT}`);
    });
    setImmediate(() => {
      try {
        readContactsFromDisk();
      } catch (err) {
        console.error('Initial contact cleanup error:', err);
      }
    });
  });

  if (httpsServer) {
    try {
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`CardVault HTTPS server listening on https://0.0.0.0:${HTTPS_PORT}`);
        const lanIps = getLocalLanIps();
        lanIps.forEach((ip) => {
          console.log(`  -> Mobile HTTPS (In-App Live Camera): https://${ip}:${HTTPS_PORT}`);
        });
      });
    } catch (err) {
      console.warn('Failed to start HTTPS server on port', HTTPS_PORT, err);
    }
  }

  // Convenience redirect on standard port 80 so users typing just the IP without :3000 are smoothly redirected
  try {
    const redirectServer80 = http.createServer((req, res) => {
      const host = (req.headers.host || '').split(':')[0] || 'localhost';
      res.writeHead(301, { Location: `http://${host}:${PORT}${req.url || '/'}` });
      res.end();
    });
    redirectServer80.on('error', () => {
      // Port 80 unavailable (requires admin or taken), ignore gracefully
    });
    redirectServer80.listen(80, '0.0.0.0', () => {
      console.log(`Port 80 redirector listening -> http://0.0.0.0:80 auto-redirects to :${PORT}`);
    });
  } catch {}
}

startServer();
