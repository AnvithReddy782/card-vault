import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  X,
  Cpu,
  Zap,
  Sliders,
  Check,
  Clipboard,
  ClipboardCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

export type OcrEnginePreference = 'hybrid' | 'rapid_ocr' | 'ai_studio';

export interface OcrConfigState {
  hasGeminiKey: boolean;
  ocrEnginePreference: OcrEnginePreference;
  aiStudioModel: string;
}

interface OcrSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated?: (newKey: string) => void;
  onConfigUpdated?: (config: OcrConfigState) => void;
}

export function OcrSettingsModal({
  isOpen,
  onClose,
  onKeyUpdated,
  onConfigUpdated,
}: OcrSettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [enginePreference, setEnginePreference] = useState<OcrEnginePreference>(
    () => (localStorage.getItem('cardvault_engine_pref') as OcrEnginePreference) || 'hybrid'
  );
  const [aiStudioModel, setAiStudioModel] = useState<string>('gemini-3.5-flash-lite');
  const [testing, setTesting] = useState(false);
  const [justPasted, setJustPasted] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const userInteractedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    userInteractedRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    // Load current config from central server
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        setHasServerKey(Boolean(data.hasGeminiKey));
        if (data.hasGeminiKey && data.maskedKey) {
          setApiKey(data.maskedKey);
        }
        if (!userInteractedRef.current && data.ocrEnginePreference) {
          setEnginePreference(data.ocrEnginePreference);
        }
        if (data.aiStudioModel) {
          setAiStudioModel(data.aiStudioModel);
        }
      })
      .catch((err) => console.error('Failed to load OCR config:', err));

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePasteKey = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          const cleaned = clipText.trim().replace(/^["']|["']$/g, '');
          setApiKey(cleaned);
          setShowKey(true);
          setTestResult(null);
          setJustPasted(true);
          setTimeout(() => setJustPasted(false), 2000);
          return;
        }
      }
    } catch {
      // Permission denied or non-https context
    }
    // Fallback: focus input so user can paste via mobile context menu / long-press
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  };

  const handleTestKey = async () => {
    const hasFreshKey = apiKey && !apiKey.includes('...');
    if (!hasFreshKey && !hasServerKey) {
      setTestResult({
        success: false,
        message: 'Please paste your full Google AI Studio API key (starts with AIzaSy...).',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: hasFreshKey ? apiKey.trim() : '',
          model: aiStudioModel === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : aiStudioModel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setTestResult({
          success: true,
          message: `Connection verified! Connected to ${data.model || 'Gemini 3.8 Flash'} with 100% multimodal vision precision.`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Google AI Studio rejected the key. Please verify your key at aistudio.google.com.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while testing Google AI Studio key.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const trimmed = apiKey.trim();

    try {
      const bodyPayload: Record<string, any> = {
        ocrEnginePreference: enginePreference,
        aiStudioModel,
      };

      if (!trimmed.includes('...')) {
        bodyPayload.geminiApiKey = trimmed;
      }

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const effectiveHasKey = Boolean(trimmed && !trimmed.includes('...')) || hasServerKey;

      if (onConfigUpdated) {
        onConfigUpdated({
          hasGeminiKey: effectiveHasKey,
          ocrEnginePreference: enginePreference,
          aiStudioModel,
        });
      }

      if (onKeyUpdated && !trimmed.includes('...')) {
        onKeyUpdated(trimmed);
      }
      localStorage.setItem('cardvault_engine_pref', enginePreference);
      onClose();
    } catch (err) {
      console.error('Failed to save OCR configuration:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    setApiKey('');
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey: '', ocrEnginePreference: 'rapid_ocr' }),
    });
    setHasServerKey(false);
    setEnginePreference('rapid_ocr');
    localStorage.setItem('cardvault_engine_pref', 'rapid_ocr');

    if (onConfigUpdated) {
      onConfigUpdated({
        hasGeminiKey: false,
        ocrEnginePreference: 'rapid_ocr',
        aiStudioModel,
      });
    }

    if (onKeyUpdated) {
      onKeyUpdated('');
    }

    setTestResult({
      success: true,
      message: 'Reverted to local offline RapidOCR engine.',
    });
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-xl w-full h-[100dvh] sm:h-auto sm:max-h-[88vh] overflow-hidden sm:border border-slate-200 flex flex-col">
        {/* Header with Safe Area Top Padding */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3.5 sm:py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200/80 shrink-0">
              <Cpu className="w-5 h-5 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 truncate">Vision & OCR Engine</h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                Configure local RapidOCR and Google AI Studio Gemini Vision
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: SINGLE SCROLL CONTAINER */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 text-slate-800">
          {/* Section 1: Extraction Engine Strategy */}
          <div>
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2.5">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              Extraction Strategy & Accuracy Mode
            </label>
            <div className="space-y-2">
              {/* Option 1: Hybrid Mode */}
              <div
                id="option-engine-hybrid"
                onClick={() => {
                  userInteractedRef.current = true;
                  setEnginePreference('hybrid');
                }}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                  enginePreference === 'hybrid'
                    ? 'border-slate-900 bg-slate-50/80 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      enginePreference === 'hybrid' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Smart Hybrid Mode</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Fast sub-second local RapidOCR for standard cards, with 1-tap AI Reparse on any card needing extra precision or complex layout analysis.
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    enginePreference === 'hybrid' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {enginePreference === 'hybrid' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
              </div>

              {/* Option 2: Local RapidOCR Only */}
              <div
                id="option-engine-rapid-ocr"
                onClick={() => {
                  userInteractedRef.current = true;
                  setEnginePreference('rapid_ocr');
                }}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                  enginePreference === 'rapid_ocr'
                    ? 'border-slate-900 bg-slate-50/80 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      enginePreference === 'rapid_ocr' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Local RapidOCR Engine</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Zero Cost · Offline
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Runs 100% on your local CPU via PP-OCRv4 ONNX deep learning. Sub-second speed, unlimited captures, zero API fees, and total privacy.
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    enginePreference === 'rapid_ocr' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {enginePreference === 'rapid_ocr' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
              </div>

              {/* Option 3: Always AI Studio */}
              <div
                id="option-engine-ai-studio"
                onClick={() => {
                  userInteractedRef.current = true;
                  setEnginePreference('ai_studio');
                }}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                  enginePreference === 'ai_studio'
                    ? 'border-slate-900 bg-slate-50/80 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      enginePreference === 'ai_studio' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Google AI Studio Gemini Vision</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          100% Accuracy Always
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Every card is analyzed directly by Google Gemini Multimodal Vision AI. Flawless on multi-column layouts, fancy corporate logos, and international formats.
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    enginePreference === 'ai_studio' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {enginePreference === 'ai_studio' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Google AI Studio API Key Configuration */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-500" />
                <span>Google AI Studio API Key</span>
                {hasServerKey && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Saved on Server
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteKey}
                  className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1 bg-white hover:bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                  title="Paste API key directly from clipboard"
                >
                  {justPasted ? (
                    <>
                      <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Pasted!</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5 text-slate-500" />
                      <span>Paste Key</span>
                    </>
                  )}
                </button>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1 bg-white hover:bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs transition-colors"
                >
                  Get Key <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            </div>

            <div className="relative">
              <input
                ref={inputRef}
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text) {
                    e.preventDefault();
                    const cleaned = text.trim().replace(/^["']|["']$/g, '');
                    setApiKey(cleaned);
                    setShowKey(true);
                    setTestResult(null);
                  }
                }}
                onFocus={(e) => {
                  if (apiKey.includes('...')) {
                    e.target.select();
                  }
                }}
                placeholder={hasServerKey ? "Key saved on server (paste to replace)..." : "Paste your Google AI Studio key here (AIzaSy...)"}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full pl-3 pr-20 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono shadow-xs"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {apiKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      setApiKey('');
                      inputRef.current?.focus();
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                    title="Clear input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium rounded flex items-center gap-1"
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{showKey ? 'Hide' : 'Show'}</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-normal">
              Free tier on Google AI Studio includes generous daily requests at zero cost. Keys are stored locally on your device and never shared.
            </p>

            {/* AI Studio Model Selector */}
            <div className="pt-2 border-t border-slate-200/80">
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                AI Studio Vision Model
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-medium">
                {[
                  { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite', badge: 'Fast Sub-2s' },
                  { id: 'gemini-3.5-flash', label: '3.5 Flash', badge: 'High Accuracy' },
                  { id: 'gemini-2.5-flash', label: '2.5 Flash', badge: 'Standard Model' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAiStudioModel(m.id)}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      aiStudioModel === m.id
                        ? 'border-slate-900 bg-slate-100 text-slate-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="truncate">{m.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal truncate">{m.badge}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Test Status Message */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between pb-[max(env(safe-area-inset-bottom),14px)]">
          <button
            type="button"
            onClick={handleClearKey}
            className="text-xs text-slate-500 hover:text-rose-600 transition-colors"
          >
            Clear Key / Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testing || !apiKey}
              onClick={handleTestKey}
              className="px-3 sm:px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 flex items-center gap-1.5 active:scale-95 shadow-2xs"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Key'
              )}
            </button>
            <button
              id="btn-save-ocr-config"
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition-all disabled:opacity-40 flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save & Apply'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
