import { ContactRecord, ContactFields } from '../types/card';
import {
  createEmptyContactFields,
  evaluateCoreAndRecordStatus,
  evaluateSingleField,
} from '../utils/cardValidator';

export interface GoogleSheetsConfig {
  webhookUrl: string;
  autoSync: boolean;
  sheetName?: string;
  lastSyncTime?: string;
  totalSynced?: number;
}

export interface GoogleSheetsPayload {
  id: string;
  scannedAt: string;
  sheetName?: string;
  eventName?: string;
  fullName: string;
  firstName: string;
  lastName: string;
  designation: string;
  department: string;
  companyName: string;
  companyCategory: string;
  businessActivity: string;
  mobileNumber: string;
  officePhone: string;
  companyTelephone: string;
  whatsappNumber: string;
  faxNumber: string;
  email: string;
  secondaryEmail: string;
  website: string;
  companyWebsite: string;
  companyAddress: string;
  city: string;
  country: string;
  poBox: string;
  officeLocation: string;
  qrCodeInfo: string;
  otherRelevantText: string;
}

let inMemoryConfig: GoogleSheetsConfig | null = null;
const LOCAL_STORAGE_KEY = 'cardvault_sheets_config_v1';

export async function fetchServerSheetsConfig(): Promise<GoogleSheetsConfig> {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      const cfg: GoogleSheetsConfig = {
        webhookUrl: data.googleSheetsWebhookUrl || '',
        autoSync: data.googleSheetsAutoSync ?? true,
        lastSyncTime: data.googleSheetsLastSync,
      };
      inMemoryConfig = cfg;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cfg));
      } catch {}
      return cfg;
    }
  } catch (err) {
    console.warn('Could not fetch server sheets config:', err);
  }
  return getLocalSheetsConfig();
}

export function getLocalSheetsConfig(): GoogleSheetsConfig {
  if (inMemoryConfig && inMemoryConfig.webhookUrl) {
    return inMemoryConfig;
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.webhookUrl === 'string') {
        inMemoryConfig = parsed;
        return parsed;
      }
    }
  } catch {}
  return {
    webhookUrl: '',
    autoSync: true,
  };
}

export function saveLocalSheetsConfig(config: GoogleSheetsConfig): void {
  inMemoryConfig = config;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
  } catch {}
  // Broadcast to central server so all devices/members share it
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleSheetsWebhookUrl: config.webhookUrl,
      googleSheetsAutoSync: config.autoSync,
    }),
  }).catch(() => {});
}

export function toSafeSpreadsheetCell(value: string | undefined | null, isPhoneOrNumber = false): string {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  if (str.length === 0) return '';

  // Clean leading multiple apostrophes if any
  str = str.replace(/^'+/, '');

  // Formula injection prevention: values starting with =, @, or operators
  if (/^[+=@-]/.test(str)) {
    return `'${str}`;
  }

  // Force pure text for phone numbers or alphanumeric codes to preserve spaces/leading zeros
  if (isPhoneOrNumber && /^[+0-9]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

export function formatContactForSheets(contact: ContactRecord, sheetNameOverride?: string): GoogleSheetsPayload {
  const f: ContactFields = contact.fields;
  const targetSheet = sheetNameOverride || contact.eventName || contact.sheetTab || '';
  return {
    id: toSafeSpreadsheetCell(contact.id || ''),
    scannedAt: toSafeSpreadsheetCell(contact.createdAt || new Date().toISOString()),
    sheetName: targetSheet ? toSafeSpreadsheetCell(targetSheet) : undefined,
    eventName: targetSheet ? toSafeSpreadsheetCell(targetSheet) : undefined,
    fullName: toSafeSpreadsheetCell(f.fullName?.value),
    firstName: toSafeSpreadsheetCell(f.firstName?.value),
    lastName: toSafeSpreadsheetCell(f.lastName?.value),
    designation: toSafeSpreadsheetCell(f.designation?.value),
    department: toSafeSpreadsheetCell(f.department?.value),
    companyName: toSafeSpreadsheetCell(f.companyName?.value),
    companyCategory: toSafeSpreadsheetCell(f.companyCategory?.value),
    businessActivity: toSafeSpreadsheetCell(f.businessActivity?.value),
    mobileNumber: toSafeSpreadsheetCell(f.mobileNumber?.value, true),
    officePhone: toSafeSpreadsheetCell(f.officePhone?.value, true),
    companyTelephone: toSafeSpreadsheetCell(f.companyTelephone?.value, true),
    whatsappNumber: toSafeSpreadsheetCell(f.whatsappNumber?.value, true),
    faxNumber: toSafeSpreadsheetCell(f.faxNumber?.value, true),
    email: toSafeSpreadsheetCell(f.email?.value),
    secondaryEmail: toSafeSpreadsheetCell(f.secondaryEmail?.value),
    website: toSafeSpreadsheetCell(f.website?.value),
    companyWebsite: toSafeSpreadsheetCell(f.companyWebsite?.value || f.website?.value),
    companyAddress: toSafeSpreadsheetCell(f.companyAddress?.value),
    city: toSafeSpreadsheetCell(f.city?.value),
    country: toSafeSpreadsheetCell(f.country?.value),
    poBox: toSafeSpreadsheetCell(f.poBox?.value, true),
    officeLocation: toSafeSpreadsheetCell(f.officeLocation?.value),
    qrCodeInfo: toSafeSpreadsheetCell(f.qrCodeInfo?.value),
    otherRelevantText: toSafeSpreadsheetCell(f.otherRelevantText?.value),
  };
}

/**
 * Verify whether a contact has valid information (name, company, phone, or email)
 * before attempting to sync to Google Sheets, preventing empty ghost rows.
 */
export function isContactEligibleForSheets(contact: ContactRecord): boolean {
  if (!contact || !contact.fields) return false;
  const f = contact.fields;
  const name = f.fullName?.value || f.firstName?.value || f.lastName?.value || '';
  const comp = f.companyName?.value || '';
  const phone = f.mobileNumber?.value || f.officePhone?.value || f.companyTelephone?.value || '';
  const email = f.email?.value || f.secondaryEmail?.value || '';
  return Boolean(name.trim() || comp.trim() || phone.trim() || email.trim());
}

// Client-side sequential queue to ensure Google Apps Script never suffers concurrent appendRow collisions
let sheetsClientQueue: Promise<any> = Promise.resolve();

async function doSyncContactDirect(
  contact: ContactRecord,
  customWebhookUrl?: string,
  sheetNameOverride?: string
): Promise<{ success: boolean; message?: string; rowAdded?: number; sheet?: string }> {
  if (!isContactEligibleForSheets(contact)) {
    return {
      success: false,
      message: 'Card has no name, company, phone, or email. Skipped empty sync.',
    };
  }

  let config = getLocalSheetsConfig();
  if (!config.webhookUrl) {
    config = await fetchServerSheetsConfig();
  }
  const webhookUrl = (customWebhookUrl || config.webhookUrl || '').trim();
  if (!webhookUrl) {
    return {
      success: false,
      message: 'Google Sheets webhook URL is not configured.',
    };
  }

  const targetSheet = sheetNameOverride || contact.eventName || contact.sheetTab || config.sheetName || '';
  const payload = formatContactForSheets(contact, targetSheet);

  let attempt = 0;
  const maxAttempts = 2;
  let lastErr = '';

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await fetch('/api/sheets/sync-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: webhookUrl || undefined,
          contact: payload,
          sheetName: targetSheet || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Server responded with HTTP ${res.status}`);
      }

      return {
        success: true,
        message: data.message || 'Successfully appended to Google Sheet.',
        rowAdded: data.response?.rowAdded,
        sheet: data.response?.sheet || targetSheet,
      };
    } catch (error: any) {
      lastErr = error?.message || 'Failed to sync to Google Sheets';
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  console.warn('Failed to sync contact to Google Sheets after retries:', lastErr);
  return {
    success: false,
    message: lastErr,
  };
}

/**
 * Dispatch contact to Google Sheets Webhook via serialized queue
 */
export async function syncContactToGoogleSheets(
  contact: ContactRecord,
  customWebhookUrl?: string,
  sheetNameOverride?: string
): Promise<{ success: boolean; message?: string; rowAdded?: number; sheet?: string }> {
  const resultPromise = sheetsClientQueue.then(async () => {
    const res = await doSyncContactDirect(contact, customWebhookUrl, sheetNameOverride);
    // 150ms gentle throttle between sequential sync dispatches
    await new Promise((r) => setTimeout(r, 150));
    return res;
  });

  // Keep queue alive even if a task rejects
  sheetsClientQueue = resultPromise.catch(() => ({
    success: false,
    message: 'Queued sync failed',
  })) as Promise<any>;

  return resultPromise;
}

/**
 * Inspect Google Sheets workbook metadata: spreadsheet name, active tabs, and total rows
 */
export async function getGoogleWorkbookInfo(customWebhookUrl?: string): Promise<{
  success: boolean;
  spreadsheetName?: string;
  activeSheet?: string;
  tabs: string[];
  totalRows: number;
  message?: string;
}> {
  let config = getLocalSheetsConfig();
  if (!config.webhookUrl) {
    config = await fetchServerSheetsConfig();
  }
  const webhookUrl = (customWebhookUrl || config.webhookUrl || '').trim();
  if (!webhookUrl) {
    return {
      success: false,
      tabs: [],
      totalRows: 0,
      message: 'No Webhook URL configured',
    };
  }

  try {
    const q = new URLSearchParams();
    q.set('webhookUrl', webhookUrl);
    const res = await fetch(`/api/sheets/fetch-rows?${q.toString()}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      success: true,
      spreadsheetName: data.spreadsheet || 'Bussiness Cards Data',
      activeSheet: data.activeSheet || config.sheetName || 'ICAI Event leads',
      tabs: Array.isArray(data.tabs) ? data.tabs : [],
      totalRows: Array.isArray(data.rows) ? data.rows.length : 0,
    };
  } catch (err: any) {
    return {
      success: false,
      tabs: [],
      totalRows: 0,
      message: err?.message || 'Failed to fetch workbook info',
    };
  }
}

/**
 * Delete a contact row from Google Sheets by Card ID
 */
export async function deleteContactFromGoogleSheets(
  contactId: string,
  sheetName?: string,
  customWebhookUrl?: string
): Promise<{ success: boolean; message?: string }> {
  let config = getLocalSheetsConfig();
  if (!config.webhookUrl) {
    config = await fetchServerSheetsConfig();
  }
  const webhookUrl = (customWebhookUrl || config.webhookUrl || '').trim();
  if (!webhookUrl || !contactId) return { success: false, message: 'Missing webhook URL or contact ID' };

  try {
    const res = await fetch('/api/sheets/delete-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        id: contactId,
        sheetName: sheetName || config.sheetName || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok && data.success !== false,
      message: data.message || (data.response?.action === 'deleted' ? 'Deleted from Google Sheet' : 'Contact deletion requested'),
    };
  } catch (err: any) {
    console.warn('Google Sheets delete error:', err);
    return { success: false, message: err?.message || 'Failed to delete from Google Sheet' };
  }
}

/**
 * Test connectivity with the Google Apps Script Webhook
 */
export async function testGoogleSheetsWebhook(
  webhookUrl: string
): Promise<{ success: boolean; message: string; rowAdded?: number }> {
  try {
    const res = await fetch('/api/sheets/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.error || data.message || 'Webhook failed to accept test payload.',
      };
    }

    return {
      success: true,
      message: data.message || 'Connected successfully! Test row added to sheet.',
      rowAdded: data.rowAdded,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Could not connect to Webhook URL.',
    };
  }
}

/**
 * Provision / Create a new sheet tab in Google Sheets via Webhook
 */
export async function createGoogleSheetsTab(
  sheetName: string,
  customWebhookUrl?: string
): Promise<{ success: boolean; message: string }> {
  let config = getLocalSheetsConfig();
  if (!config.webhookUrl) {
    config = await fetchServerSheetsConfig();
  }
  const webhookUrl = (customWebhookUrl || config.webhookUrl || '').trim();
  const cleanName = (sheetName || '').trim();
  if (!webhookUrl || !cleanName) {
    return { success: false, message: 'Missing webhook URL or sheet name' };
  }

  try {
    const res = await fetch('/api/sheets/create-tab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        sheetName: cleanName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok && data.success !== false,
      message: data.message || `Tab '${cleanName}' provisioned in Google Sheet`,
    };
  } catch (err: any) {
    console.warn('[Sheets Tab Provision] Error:', err);
    return { success: false, message: err?.message || 'Failed to provision tab in Google Sheet' };
  }
}

/**
 * Pull and parse all contact rows from Google Sheets (Treating Google Sheets as Primary Database)
 */
export async function pullContactsFromGoogleSheets(
  sheetName?: string,
  customWebhookUrl?: string
): Promise<{
  success: boolean;
  message: string;
  contacts: ContactRecord[];
  eventTabs: string[];
  total: number;
}> {
  let config = getLocalSheetsConfig();
  if (!config.webhookUrl) {
    config = await fetchServerSheetsConfig();
  }
  const webhookUrl = (customWebhookUrl || config.webhookUrl || '').trim();
  if (!webhookUrl) {
    return {
      success: false,
      message: 'Google Sheets webhook URL is not configured.',
      contacts: [],
      eventTabs: [],
      total: 0,
    };
  }

  try {
    const q = new URLSearchParams();
    q.set('webhookUrl', webhookUrl);
    if (sheetName) q.set('sheet', sheetName);

    const res = await fetch(`/api/sheets/fetch-rows?${q.toString()}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${res.status}`);
    }

    const data = await res.json();
    if (!data || data.status === 'error') {
      throw new Error(data?.message || 'Failed to read rows from Google Sheet');
    }

    const rawRows: Record<string, any>[] = Array.isArray(data.rows) ? data.rows : [];
    const eventTabs: string[] = Array.isArray(data.tabs) ? data.tabs : [];

    const contacts: ContactRecord[] = [];

    for (const row of rawRows) {
      const getVal = (aliases: string[]): string => {
        for (const [key, val] of Object.entries(row)) {
          const cleanK = key.trim().toLowerCase();
          for (const alias of aliases) {
            if (cleanK === alias || cleanK.includes(alias)) {
              if (val !== null && val !== undefined && String(val).trim()) {
                return String(val).replace(/^'+/, '').trim();
              }
            }
          }
        }
        return '';
      };

      const fullName = getVal(['full name', 'contact name', 'person', 'lead name', 'name']);
      const companyName = getVal(['company name', 'company', 'organization', 'firm', 'agency', 'business']);
      const mobileNumber = getVal(['mobile number', 'mobile', 'cell', 'phone', 'contact no', 'contact', 'handphone']);
      const email = getVal(['email', 'e-mail', 'mail']);

      // Skip empty separator rows
      if (!fullName && !companyName && !mobileNumber && !email) continue;

      const f = createEmptyContactFields();
      f.fullName = evaluateSingleField('fullName', { value: fullName, confidence: 95 });
      f.companyName = evaluateSingleField('companyName', { value: companyName, confidence: 95 });
      f.designation = evaluateSingleField('designation', {
        value: getVal(['designation', 'job title', 'title', 'position', 'role']),
        confidence: 90,
      });
      f.department = evaluateSingleField('department', {
        value: getVal(['department', 'dept', 'division']),
        confidence: 90,
      });
      f.mobileNumber = evaluateSingleField('mobileNumber', { value: mobileNumber, confidence: 95 });
      f.officePhone = evaluateSingleField('officePhone', {
        value: getVal(['office phone', 'work phone', 'office', 'direct']),
        confidence: 90,
      });
      f.companyTelephone = evaluateSingleField('companyTelephone', {
        value: getVal(['company tel', 'telephone', 'landline', 'tel']),
        confidence: 90,
      });
      f.whatsappNumber = evaluateSingleField('whatsappNumber', {
        value: getVal(['whatsapp', 'wa']),
        confidence: 90,
      });
      f.email = evaluateSingleField('email', { value: email, confidence: 95 });
      f.secondaryEmail = evaluateSingleField('secondaryEmail', {
        value: getVal(['secondary email', 'alt email', 'sec email']),
        confidence: 90,
      });
      f.website = evaluateSingleField('website', {
        value: getVal(['website', 'company website', 'web', 'url', 'site']),
        confidence: 90,
      });
      f.companyAddress = evaluateSingleField('companyAddress', {
        value: getVal(['address', 'company address', 'street', 'location']),
        confidence: 90,
      });
      f.city = evaluateSingleField('city', { value: getVal(['city', 'town', 'emirate']), confidence: 90 });
      f.country = evaluateSingleField('country', { value: getVal(['country', 'nation']), confidence: 90 });
      f.poBox = evaluateSingleField('poBox', { value: getVal(['po box', 'p.o. box', 'box', 'zip', 'postal']), confidence: 90 });
      f.officeLocation = evaluateSingleField('officeLocation', { value: getVal(['suite', 'floor', 'office location']), confidence: 90 });
      f.otherRelevantText = evaluateSingleField('otherRelevantText', {
        value: getVal(['notes', 'remarks', 'other', 'qr info']),
        confidence: 85,
      });

      const validation = evaluateCoreAndRecordStatus(f);
      const rowId = getVal(['card id', 'id']) || `CV-SHEET-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
      const scannedAt = getVal(['date scanned', 'scannedat', 'date', 'createdat']) || new Date().toISOString();
      const targetTab = row._sheetTab || getVal(['event', 'sheet', 'tab']) || 'Default';

      const contact: ContactRecord = {
        id: rowId,
        scanHash: `hash-${rowId}`,
        createdAt: scannedAt,
        updatedAt: new Date().toISOString(),
        overallStatus: validation.overallStatus,
        missingCoreFieldLabels: validation.missingCoreFields.map((m) => m.label),
        reviewReasons: validation.otherReviewIssues,
        frontImageBase64: '',
        rawOcrFront: '',
        cardOrientation: 'horizontal',
        imageQualityIssues: [],
        frontBackConflicts: [],
        fields: f,
        customFields: [],
        eventName: targetTab,
        sheetTab: targetTab,
        syncStatus: 'SYNCED',
      };

      contacts.push(contact);
    }

    return {
      success: true,
      message: `Successfully loaded ${contacts.length} leads from Google Sheets.`,
      contacts,
      eventTabs,
      total: contacts.length,
    };
  } catch (err: any) {
    console.error('Error pulling contacts from Google Sheets:', err);
    return {
      success: false,
      message: err?.message || 'Failed to pull contacts from Google Sheets',
      contacts: [],
      eventTabs: [],
      total: 0,
    };
  }
}
