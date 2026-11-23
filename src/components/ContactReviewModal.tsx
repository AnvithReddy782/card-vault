import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Cpu,
  FileText,
  Folder,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ContactFields,
  ContactRecord,
  CustomCardField,
  INDUSTRY_CATEGORIES,
} from '../types/card';
import {
  ALL_FIELD_META,
  evaluateCoreAndRecordStatus,
  evaluateSingleField,
} from '../utils/cardValidator';

interface ContactReviewModalProps {
  contact: ContactRecord;
  availableEvents?: string[];
  onCreateEvent?: (name: string) => void;
  onSaveAndContinue: (updatedContact: ContactRecord) => Promise<void>;
  onDeleteContact?: (id: string) => Promise<void>;
  onClose: () => void;
}

export const ContactReviewModal: React.FC<ContactReviewModalProps> = ({
  contact,
  availableEvents = ['Default'],
  onCreateEvent,
  onSaveAndContinue,
  onDeleteContact,
  onClose,
}) => {
  const [fields, setFields] = useState<ContactFields>(contact.fields);
  const [selectedEvent, setSelectedEvent] = useState<string>(
    contact.eventName || contact.sheetTab || 'Default'
  );
  const [showNewEventInline, setShowNewEventInline] = useState<boolean>(false);
  const [newEventInlineName, setNewEventInlineName] = useState<string>('');
  const [customFields, setCustomFields] = useState<CustomCardField[]>(
    contact.customFields || []
  );
  const [activeImageSide, setActiveImageSide] = useState<'FRONT' | 'BACK'>('FRONT');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [showRawOcr, setShowRawOcr] = useState<boolean>(false);
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [mobileActivePane, setMobileActivePane] = useState<'FIELDS' | 'EVIDENCE' | 'LOG'>('FIELDS');
  const [desktopActiveTab, setDesktopActiveTab] = useState<'FIELDS' | 'LOG'>('FIELDS');
  const [assignSuccessNotice, setAssignSuccessNotice] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const handleSwapNameAndCompany = () => {
    const curName = fields.fullName?.value || '';
    const curComp = fields.companyName?.value || '';
    const parts = curComp.trim().split(/\s+/).filter(Boolean);
    const fName = parts[0] || '';
    const lName = parts.slice(1).join(' ') || '';

    setFields((prev) => ({
      ...prev,
      fullName: evaluateSingleField('fullName', {
        value: curComp,
        confidence: curComp.trim() ? 100 : 0,
        source: 'USER_EDITED',
      }),
      firstName: evaluateSingleField('firstName', {
        value: fName,
        confidence: fName ? 100 : 0,
        source: 'USER_EDITED',
      }),
      lastName: evaluateSingleField('lastName', {
        value: lName,
        confidence: lName ? 100 : 0,
        source: 'USER_EDITED',
      }),
      companyName: evaluateSingleField('companyName', {
        value: curName,
        confidence: curName.trim() ? 100 : 0,
        source: 'USER_EDITED',
      }),
    }));
    setAssignSuccessNotice(`Swapped: "${curComp || 'Empty'}" ⇄ "${curName || 'Empty'}"`);
    setTimeout(() => setAssignSuccessNotice(null), 2500);
  };

  const [isAiBoosting, setIsAiBoosting] = useState(false);
  const [aiBoostNotice, setAiBoostNotice] = useState<string | null>(null);

  const handleAiStudioBoost = async () => {
    if (!contact.frontImageBase64) {
      setAssignSuccessNotice('No business card photo available to analyze with AI Studio.');
      setTimeout(() => setAssignSuccessNotice(null), 3000);
      return;
    }

    setIsAiBoosting(true);
    setAiBoostNotice(null);

    try {
      const res = await fetch('/api/cards/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontImageBase64: contact.frontImageBase64,
          backImageBase64: contact.backImageBase64,
          forceGemini: true,
          forceReprocess: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setAssignSuccessNotice(data.error || 'Google AI Studio extraction failed.');
        setTimeout(() => setAssignSuccessNotice(null), 4000);
        return;
      }

      if (data.extraction && data.extraction.fields) {
        setFields(data.extraction.fields);
        if (Array.isArray(data.extraction.customFields) && data.extraction.customFields.length > 0) {
          setCustomFields(data.extraction.customFields);
        }
        setAiBoostNotice('✨ Boosted with Google AI Studio Gemini 2.5 (100% precision)!');
        setAssignSuccessNotice('✨ Fields updated with Google AI Studio deep multimodal vision!');
        setTimeout(() => setAiBoostNotice(null), 6000);
        setTimeout(() => setAssignSuccessNotice(null), 4000);
      }
    } catch (err: any) {
      setAssignSuccessNotice(`AI Studio error: ${err.message || err}`);
      setTimeout(() => setAssignSuccessNotice(null), 4000);
    } finally {
      setIsAiBoosting(false);
    }
  };

  const handleAssignLineToField = (key: keyof ContactFields, text: string, label: string) => {
    handleFieldChange(key, text.trim());
    if (key === 'fullName') {
      const parts = text.trim().split(/\s+/).filter(Boolean);
      handleFieldChange('firstName', parts[0] || '');
      handleFieldChange('lastName', parts.slice(1).join(' ') || '');
    }
    setAssignSuccessNotice(`Assigned to ${label}: "${text.trim().slice(0, 24)}"`);
    setTimeout(() => setAssignSuccessNotice(null), 2500);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showDeleteConfirm]);

  const liveValidation = evaluateCoreAndRecordStatus(
    fields,
    contact.frontBackConflicts,
    contact.imageQualityIssues,
    contact.duplicateMatchReason
  );

  const handleFieldChange = (key: keyof ContactFields, newValue: string) => {
    setFields((prev) => {
      const updatedField = evaluateSingleField(key, {
        value: newValue,
        confidence: newValue.trim() ? 100 : 0,
        source: 'USER_EDITED',
        isUnclear: false,
      });
      return {
        ...prev,
        [key]: updatedField,
      };
    });
  };

  const handleResolveConflict = (fieldKey: string, chosenValue: string) => {
    if (fieldKey in fields) {
      handleFieldChange(fieldKey as keyof ContactFields, chosenValue);
    }
  };

  const handleAddCustomField = () => {
    setCustomFields((prev) => [
      ...prev,
      {
        id: `cf_${Date.now()}`,
        label: 'Custom Note',
        value: '',
        confidence: 100,
        source: 'USER_EDITED',
      },
    ]);
  };

  const handleSave = async (markAllReviewedAsVerified: boolean) => {
    setIsSaving(true);
    try {
      const nextFields = { ...fields };
      if (markAllReviewedAsVerified) {
        (Object.keys(nextFields) as (keyof ContactFields)[]).forEach((k) => {
          if (nextFields[k].value.trim()) {
            nextFields[k] = {
              ...nextFields[k],
              confidence: 100,
              status: 'VERIFIED',
              isUnclear: false,
              validationIssue: undefined,
            };
          }
        });
      }

      const finalEval = evaluateCoreAndRecordStatus(
        nextFields,
        markAllReviewedAsVerified ? [] : contact.frontBackConflicts,
        contact.imageQualityIssues,
        markAllReviewedAsVerified ? undefined : contact.duplicateMatchReason
      );

      const updatedRecord: ContactRecord = {
        ...contact,
        eventName: selectedEvent,
        sheetTab: selectedEvent,
        updatedAt: new Date().toISOString(),
        fields: nextFields,
        customFields: customFields.filter((cf) => cf.label.trim() && cf.value.trim()),
        overallStatus:
          markAllReviewedAsVerified && finalEval.missingCoreFields.length === 0
            ? 'VERIFIED'
            : 'NEEDS_REVIEW',
        savedWithoutCoreFields: finalEval.missingCoreFields.length > 0,
        missingCoreFieldLabels: finalEval.missingCoreFields.map((m) => m.label),
        reviewReasons: markAllReviewedAsVerified
          ? finalEval.missingCoreFields.map((m) => `Missing ${m.label}`)
          : [
              ...finalEval.missingCoreFields.map((m) => `Missing ${m.label}`),
              ...finalEval.uncertainCoreFields.map((u) => `${u.label}: ${u.reason}`),
              ...finalEval.otherReviewIssues,
            ],
      };

      await onSaveAndContinue(updatedRecord);
    } finally {
      setIsSaving(false);
    }
  };

  const activeImageSrc =
    activeImageSide === 'BACK' && contact.backImageBase64
      ? contact.backImageBase64
      : contact.frontImageBase64;

  const sections: ('Contact Information' | 'Company Information' | 'Additional Information')[] =
    ['Contact Information', 'Company Information', 'Additional Information'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-white sm:border border-slate-200 rounded-none sm:rounded-2xl max-w-6xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Header with Safe Area Inset */}
        <div className="px-3.5 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-2.5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between gap-2.5 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0 active:scale-95 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {fields.fullName?.value || fields.companyName?.value || 'Edit Contact'}
              </h2>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span className="font-mono text-[10px]">{contact.id}</span>
                <span>·</span>
                <span
                  className={`font-semibold ${
                    liveValidation.allCoreVerified ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {liveValidation.allCoreVerified ? '✓ Verified' : 'Needs Review'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Event / Database Tab Picker */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
              <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {showNewEventInline ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={newEventInlineName}
                    onChange={(e) => setNewEventInlineName(e.target.value)}
                    placeholder="New tab..."
                    className="w-20 px-1 py-0.5 text-xs border border-slate-300 rounded bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!newEventInlineName.trim()}
                    onClick={() => {
                      const trimmed = newEventInlineName.trim();
                      if (trimmed) {
                        if (onCreateEvent) onCreateEvent(trimmed);
                        setSelectedEvent(trimmed);
                        setShowNewEventInline(false);
                      }
                    }}
                    className="px-1.5 py-0.5 text-[10px] font-medium text-white bg-slate-900 rounded disabled:opacity-50 cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewEventInline(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <select
                  value={selectedEvent}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setShowNewEventInline(true);
                    } else {
                      setSelectedEvent(e.target.value);
                    }
                  }}
                  className="text-xs font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer max-w-[100px] sm:max-w-none truncate"
                >
                  {availableEvents.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                  <option value="__NEW__">+ New Event...</option>
                </select>
              )}
            </div>

            {/* AI Studio Deep Boost Button */}
            <button
              type="button"
              disabled={isAiBoosting}
              onClick={handleAiStudioBoost}
              className="h-8 px-2.5 sm:px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 shadow-2xs active:scale-98 transition-colors disabled:opacity-50 cursor-pointer"
              title="Extra Attention / Max Precision: Re-extract with Google AI Studio Gemini Vision"
            >
              {isAiBoosting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
                  <span className="hidden sm:inline">Reparsing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden xs:inline">AI Reparse</span>
                  <span className="xs:hidden">AI</span>
                </>
              )}
            </button>

            {/* Desktop Action Buttons */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSwapNameAndCompany}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1 shadow-2xs active:scale-98 transition-colors cursor-pointer"
                title="Swap Name ⇄ Company"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
                <span>Swap</span>
              </button>

              {onDeleteContact && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-rose-600 font-medium text-xs flex items-center gap-1 shadow-2xs active:scale-98 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave(true)}
                className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs active:scale-98 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{liveValidation.allCoreVerified ? 'Verify & Save' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Notification Pill (e.g. Swapped or Assigned) */}
        {assignSuccessNotice && (
          <div className="bg-slate-900 text-white text-xs font-medium py-1.5 px-4 text-center flex items-center justify-center gap-2 shadow-2xs animate-in fade-in slide-in-from-top-1 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{assignSuccessNotice}</span>
          </div>
        )}

        {/* Mobile View Tab Switcher: 3 crisp options */}
        <div className="lg:hidden px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileActivePane('FIELDS');
              setDesktopActiveTab('FIELDS');
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors text-center flex items-center justify-center gap-1.5 ${
              mobileActivePane === 'FIELDS'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Details</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileActivePane('EVIDENCE')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors text-center flex items-center justify-center gap-1.5 ${
              mobileActivePane === 'EVIDENCE'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Card Photo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileActivePane('LOG');
              setDesktopActiveTab('LOG');
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors text-center flex items-center justify-center gap-1.5 ${
              mobileActivePane === 'LOG'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Audit Log</span>
          </button>
        </div>

        {/* Body Split Grid: Left Evidence & Raw OCR (5 cols) | Right Editable Structured Fields (7 cols) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left Pane: Original Card Image + Raw OCR Evidence */}
          <div className={`lg:col-span-5 p-4 sm:p-5 space-y-4 bg-slate-50/60 ${mobileActivePane === 'EVIDENCE' ? 'block' : 'hidden lg:block'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveImageSide('FRONT')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    activeImageSide === 'FRONT'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Front Side
                </button>
                {contact.backImageBase64 && (
                  <button
                    type="button"
                    onClick={() => setActiveImageSide('BACK')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      activeImageSide === 'BACK'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Back Side
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(1, z - 0.25))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono px-1.5 tabular-nums">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageRotation((r) => (r + 90) % 360)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                  title="Rotate card view"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Card Image Frame */}
            <div className="bg-slate-900 rounded-xl overflow-auto max-h-[320px] flex items-center justify-center p-4 border border-slate-800">
              {activeImageSrc ? (
                <img
                  src={activeImageSrc}
                  alt={`Original business card (${activeImageSide})`}
                  referrerPolicy="no-referrer"
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${imageRotation}deg)`,
                    transformOrigin: 'center center',
                  }}
                  className="max-w-full max-h-[280px] object-contain transition-transform duration-150 rounded"
                />
              ) : (
                <div className="text-xs text-slate-400 py-12">
                  No card image stored for this side
                </div>
              )}
            </div>

            {/* Front / Back Conflict Resolver if any */}
            {Boolean(contact.frontBackConflicts && contact.frontBackConflicts.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Conflicting Information Between Front & Back Sides
                </div>
                {contact.frontBackConflicts.map((c, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-amber-200 rounded-lg p-2.5 text-xs space-y-1.5"
                  >
                    <div className="font-semibold text-slate-800">{c.fieldLabel}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleResolveConflict(c.fieldKey, c.frontValue)}
                        className="text-left p-2 rounded border border-slate-200 hover:border-blue-500 hover:bg-blue-50"
                      >
                        <div className="text-[10px] text-slate-500">Use Front Value</div>
                        <div className="font-mono text-slate-900 truncate">
                          {c.frontValue}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveConflict(c.fieldKey, c.backValue)}
                        className="text-left p-2 rounded border border-slate-200 hover:border-blue-500 hover:bg-blue-50"
                      >
                        <div className="text-[10px] text-slate-500">Use Back Value</div>
                        <div className="font-mono text-slate-900 truncate">
                          {c.backValue}
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Verbatim Stage 1 Raw OCR Transcript with 1-Click Field Assignor */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" />
                    OCR Text Evidence & 1-Tap Assignor
                  </span>
                  <p className="text-[10px] text-slate-500">
                    Click any line to immediately assign it to a field
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawOcr((prev) => !prev)}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  {showRawOcr ? 'Compact View' : 'Full Line List'}
                </button>
              </div>

              {(() => {
                const currentRaw = activeImageSide === 'BACK' && contact.rawOcrBack
                  ? contact.rawOcrBack
                  : contact.rawOcrFront || '';
                const ocrLines = currentRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

                if (ocrLines.length === 0) {
                  return (
                    <div className="text-xs text-slate-400 font-mono p-3 bg-slate-50 rounded-lg border border-slate-200">
                      No raw OCR lines recorded for this card side.
                    </div>
                  );
                }

                return (
                  <div className={`space-y-1.5 overflow-y-auto ${showRawOcr ? 'max-h-80' : 'max-h-48'}`}>
                    {ocrLines.map((lineText, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 transition flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-slate-800 font-semibold select-all truncate">
                            {lineText}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            #{idx + 1}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60">
                          <span className="text-[10px] font-medium text-slate-400 mr-0.5">Assign:</span>
                          <button
                            type="button"
                            onClick={() => handleAssignLineToField('fullName', lineText, 'Full Name')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-95 transition cursor-pointer"
                          >
                            Name
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAssignLineToField('companyName', lineText, 'Company Name')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-95 transition cursor-pointer"
                          >
                            Company
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAssignLineToField('designation', lineText, 'Job Title')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-95 transition cursor-pointer"
                          >
                            Title
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAssignLineToField('mobileNumber', lineText, 'Mobile Phone')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-95 transition cursor-pointer"
                          >
                            Phone
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAssignLineToField('email', lineText, 'Email Address')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-95 transition cursor-pointer"
                          >
                            Email
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right Pane: Structured Fields Editor with Provenance & Confidence OR Scan Decision Log */}
          <div className={`lg:col-span-7 p-4 sm:p-6 space-y-6 ${mobileActivePane === 'FIELDS' || mobileActivePane === 'LOG' ? 'block' : 'hidden lg:block'}`}>
            {/* View Switcher Header (Desktop Only) */}
            <div className="hidden lg:flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setDesktopActiveTab('FIELDS');
                    setMobileActivePane('FIELDS');
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    desktopActiveTab === 'FIELDS' && mobileActivePane !== 'LOG'
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Edit Fields
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDesktopActiveTab('LOG');
                    setMobileActivePane('LOG');
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                    desktopActiveTab === 'LOG' || mobileActivePane === 'LOG'
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-slate-500" />
                  <span>Scan Decision Log</span>
                </button>
              </div>

              {/* 1-Tap Quick Swap Name ⇄ Company Button right inside fields view */}
              <button
                type="button"
                onClick={handleSwapNameAndCompany}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 active:scale-95 transition shadow-2xs cursor-pointer"
                title="Swap Full Name and Company Name"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
                <span>Swap Name ⇄ Company</span>
              </button>
            </div>

            {/* IF LOG VIEW ACTIVE: Render Full Scan Extraction & Decision Audit Log */}
            {(desktopActiveTab === 'LOG' || mobileActivePane === 'LOG') ? (
              <div className="space-y-4">
                {/* Engine and Summary Bar */}
                <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shadow-2xs border border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-sm tracking-wide">
                        {contact.scanLog?.engineUsed || 'RapidOCR PP-OCRv4 (Deep Learning Local Engine)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Card extraction telemetry, line-by-line attribution, and anomaly audit
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/20">
                      {contact.scanLog?.totalLinesDetected || (contact.rawOcrFront ? contact.rawOcrFront.split(/\r?\n/).filter(Boolean).length : 0)} Lines Processed
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {liveValidation.allCoreVerified ? '100% Verified' : 'Needs Review'}
                    </span>
                  </div>
                </div>

                {/* Disambiguation Notes */}
                {contact.scanLog?.disambiguationNotes && contact.scanLog.disambiguationNotes.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-slate-500" />
                      Disambiguation & Intelligence Decisions:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.scanLog.disambiguationNotes.map((note, nIdx) => (
                        <span key={nIdx} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] font-medium shadow-2xs">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Anomalies & Warnings */}
                {contact.scanLog?.anomalies && contact.scanLog.anomalies.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Scan Flags & Quality Warnings:
                    </span>
                    <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5 pl-1">
                      {contact.scanLog.anomalies.map((anom, aIdx) => (
                        <li key={aIdx}>{anom}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Line-by-Line Decision Audit Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Line-by-Line Field Attribution & Scoring
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {contact.scanLog?.decisions?.length || 0} Decisions Logged
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                    {(!contact.scanLog?.decisions || contact.scanLog.decisions.length === 0) ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No line-by-line audit decisions logged for this historical record. Newly scanned cards will record full step-by-step telemetry.
                      </div>
                    ) : (
                      contact.scanLog.decisions.map((dec, dIdx) => (
                        <div key={dIdx} className="p-3 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-1 max-w-md">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-700 font-bold">
                                Line #{dec.lineIndex + 1}
                              </span>
                              <span className="font-semibold text-slate-900 font-mono">
                                "{dec.lineText}"
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Reason: <span className="text-slate-700 font-medium">{dec.reason}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {dec.fieldLabel || dec.assignedField}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {dec.confidence}%
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {sections.map((sectionTitle) => {
              const sectionFields = ALL_FIELD_META.filter(
                (m) => m.section === sectionTitle
              );

              return (
                <div key={sectionTitle} className="space-y-3">
                  <div className="border-b border-slate-200 pb-1.5 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">{sectionTitle}</h3>
                    <span className="text-xs text-slate-500">
                      OCR Confidence & Field Verification
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {sectionFields.map((meta) => {
                      const fieldData = fields[meta.key];
                      const isCompanyCategory = meta.key === 'companyCategory';

                      return (
                        <div
                          key={meta.key}
                          className={`p-3 rounded-xl border transition-colors ${
                            fieldData.status === 'NEEDS_REVIEW'
                              ? 'border-amber-300 bg-amber-50/40'
                              : meta.isCore && fieldData.status === 'MISSING'
                              ? 'border-red-200 bg-red-50/30'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                              {meta.label}
                              {meta.isCore && (
                                <span
                                  className="text-[10px] font-normal text-blue-600"
                                  title="Core contact field for auto-save"
                                >
                                  (Core)
                                </span>
                              )}
                            </label>

                            <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
                              {fieldData.status === 'VERIFIED' && (
                                <span className="text-emerald-700 flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {fieldData.confidence}%
                                </span>
                              )}
                              {fieldData.status === 'NEEDS_REVIEW' && (
                                <span className="text-amber-700 font-semibold flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" />
                                  Review ({fieldData.confidence}%)
                                </span>
                              )}
                              {fieldData.status === 'MISSING' && (
                                <span className="text-slate-400">Empty</span>
                              )}
                            </div>
                          </div>

                          {isCompanyCategory ? (
                            <div className="space-y-1.5">
                              <select
                                value={
                                  INDUSTRY_CATEGORIES.includes(fieldData.value as any)
                                    ? fieldData.value
                                    : 'Other / Unclassified'
                                }
                                onChange={(e) =>
                                  handleFieldChange('companyCategory', e.target.value)
                                }
                                className="w-full px-3 py-2 text-[16px] sm:text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] sm:min-h-[38px]"
                              >
                                <option value="">Select Industry Category...</option>
                                {INDUSTRY_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={customCategoryInput}
                                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                                  placeholder="Or type custom category..."
                                  className="flex-1 px-3 py-1.5 text-[16px] sm:text-xs rounded-xl border border-slate-200 bg-white text-slate-800 min-h-[40px] sm:min-h-[34px]"
                                />
                                {customCategoryInput.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleFieldChange(
                                        'companyCategory',
                                        customCategoryInput.trim()
                                      );
                                      setCustomCategoryInput('');
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl min-h-[40px] sm:min-h-[34px]"
                                  >
                                    Apply
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={fieldData.value}
                              placeholder={`Not found on card`}
                              onChange={(e) =>
                                handleFieldChange(meta.key, e.target.value)
                              }
                              className="w-full px-3 py-2 text-[16px] sm:text-xs rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] sm:min-h-[38px]"
                            />
                          )}

                          {/* Source & Validation Warning Line */}
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              Source:{' '}
                              {fieldData.source === 'USER_EDITED'
                                ? 'User Verified'
                                : fieldData.value
                                ? `Printed (${fieldData.source})`
                                : 'None'}
                            </span>
                            {fieldData.validationIssue && (
                              <span className="text-amber-700 font-medium">
                                {fieldData.validationIssue}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Custom Fields Section */}
            <div className="space-y-3 pt-2">
              <div className="border-b border-slate-200 pb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Custom Non-Standard Card Fields
                </h3>
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Custom Field
                </button>
              </div>

              {customFields.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No additional non-standard fields detected. Click Add Custom Field to record extra printed items.
                </p>
              ) : (
                <div className="space-y-2">
                  {customFields.map((cf, idx) => (
                    <div key={cf.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cf.label}
                        onChange={(e) => {
                          const next = [...customFields];
                          next[idx] = { ...cf, label: e.target.value };
                          setCustomFields(next);
                        }}
                        placeholder="Field Label"
                        className="w-1/3 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300"
                      />
                      <input
                        type="text"
                        value={cf.value}
                        onChange={(e) => {
                          const next = [...customFields];
                          next[idx] = { ...cf, value: e.target.value };
                          setCustomFields(next);
                        }}
                        placeholder="Value"
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCustomFields((prev) => prev.filter((item) => item.id !== cf.id))
                        }
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>

        {/* Pinned Mobile & Safe-Area Action Bar */}
        <div className="shrink-0 bg-white border-t border-slate-200 px-3.5 py-2.5 pb-[max(env(safe-area-inset-bottom),14px)] flex items-center justify-between gap-2 shadow-sm z-20 sm:hidden">
          <button
            type="button"
            id="mobile-swap-btn"
            onClick={handleSwapNameAndCompany}
            className="min-h-[40px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1 shrink-0 active:scale-95 transition shadow-2xs cursor-pointer"
            title="Swap Name ⇄ Company"
          >
            <ArrowLeftRight className="w-4 h-4 text-slate-500" />
            <span>Swap</span>
          </button>

          {onDeleteContact && (
            <button
              type="button"
              id="mobile-delete-btn"
              disabled={isSaving}
              onClick={() => setShowDeleteConfirm(true)}
              className="min-h-[40px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-rose-600 font-medium text-xs flex items-center gap-1 shrink-0 active:scale-95 transition shadow-2xs cursor-pointer"
              title="Delete Contact"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {liveValidation.missingCoreFields.length > 0 && (
            <button
              type="button"
              id="mobile-save-draft-btn"
              disabled={isSaving}
              onClick={() => handleSave(false)}
              className="min-h-[40px] px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-medium text-xs flex items-center gap-1 shrink-0 active:scale-95 transition shadow-2xs cursor-pointer"
              title="Save as Needs Review"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </button>
          )}

          <button
            type="button"
            id="mobile-save-btn"
            disabled={isSaving}
            onClick={() => handleSave(true)}
            className="flex-1 min-h-[40px] px-4 py-2 rounded-lg font-medium text-xs text-white bg-slate-900 hover:bg-slate-800 flex items-center justify-center gap-1.5 shadow-2xs active:scale-98 transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{liveValidation.allCoreVerified ? 'Verify & Save' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* In-App Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3.5 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Delete Contact Record?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Permanently delete <strong className="text-slate-900">"{fields.fullName.value || fields.companyName.value || contact.id}"</strong> from CardVault and trigger automated row deletion in connected Google Sheets tabs?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onDeleteContact) {
                    await onDeleteContact(contact.id);
                    onClose();
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
