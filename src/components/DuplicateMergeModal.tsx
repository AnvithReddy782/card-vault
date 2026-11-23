import React, { useState } from 'react';
import { ArrowRightLeft, CheckCircle2, GitMerge, X } from 'lucide-react';
import { ContactFields, ContactRecord } from '../types/card';
import {
  ALL_FIELD_META,
  evaluateCoreAndRecordStatus,
  evaluateSingleField,
} from '../utils/cardValidator';

interface DuplicateMergeModalProps {
  primaryContact: ContactRecord;
  duplicateContact: ContactRecord;
  onConfirmMerge: (mergedContact: ContactRecord, removeContactId: string) => Promise<void>;
  onClose: () => void;
}

export const DuplicateMergeModal: React.FC<DuplicateMergeModalProps> = ({
  primaryContact,
  duplicateContact,
  onConfirmMerge,
  onClose,
}) => {
  const [selectedValues, setSelectedValues] = useState<Record<keyof ContactFields, string>>(
    () => {
      const initial = {} as Record<keyof ContactFields, string>;
      ALL_FIELD_META.forEach((meta) => {
        const valA = primaryContact.fields[meta.key]?.value || '';
        const valB = duplicateContact.fields[meta.key]?.value || '';
        initial[meta.key] = valA || valB;
      });
      return initial;
    }
  );
  const [isMerging, setIsMerging] = useState<boolean>(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      const mergedFields = { ...primaryContact.fields };
      ALL_FIELD_META.forEach((meta) => {
        const chosen = selectedValues[meta.key] || '';
        mergedFields[meta.key] = evaluateSingleField(meta.key, {
          value: chosen,
          confidence: chosen ? 100 : 0,
          source: 'USER_EDITED',
          isUnclear: false,
        });
      });

      const validation = evaluateCoreAndRecordStatus(mergedFields);

      const mergedRecord: ContactRecord = {
        ...primaryContact,
        updatedAt: new Date().toISOString(),
        overallStatus: validation.overallStatus,
        savedWithoutCoreFields: validation.missingCoreFields.length > 0,
        missingCoreFieldLabels: validation.missingCoreFields.map((m) => m.label),
        reviewReasons: validation.missingCoreFields.map((m) => `Missing ${m.label}`),
        duplicateOfId: undefined,
        duplicateMatchReason: undefined,
        backImageBase64:
          primaryContact.backImageBase64 || duplicateContact.frontImageBase64,
        rawOcrBack:
          primaryContact.rawOcrBack ||
          `[Merged from ${duplicateContact.id}]\n${duplicateContact.rawOcrFront}`,
        fields: mergedFields,
      };

      await onConfirmMerge(mergedRecord, duplicateContact.id);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-stretch sm:items-center justify-center p-0 sm:p-5 overflow-hidden animate-in fade-in duration-150"
    >
      <div className="bg-white sm:border border-slate-200 rounded-none sm:rounded-2xl max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header with Safe Area Top Padding */}
        <div className="px-4 sm:px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200/80 shadow-2xs shrink-0">
              <GitMerge className="w-4 h-4 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                Resolve & Merge Duplicate Contacts
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                Select which field values to retain. Both card images will be preserved.
              </p>
            </div>
          </div>
          <button
            id="btn-close-merge-modal"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          {/* Card Previews */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                Record A: {primaryContact.id} (Scanned{' '}
                {new Date(primaryContact.createdAt).toLocaleDateString()})
              </div>
              <img
                src={primaryContact.frontImageBase64}
                alt="Record A Card"
                referrerPolicy="no-referrer"
                className="h-28 w-full object-contain bg-slate-900 rounded-lg p-1"
              />
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                Record B: {duplicateContact.id} (Scanned{' '}
                {new Date(duplicateContact.createdAt).toLocaleDateString()})
              </div>
              <img
                src={duplicateContact.frontImageBase64}
                alt="Record B Card"
                referrerPolicy="no-referrer"
                className="h-28 w-full object-contain bg-slate-900 rounded-lg p-1"
              />
            </div>
          </div>

          {/* Desktop Table Comparison (>= md) */}
          <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 border-b border-slate-200">
              <div className="col-span-3">Field</div>
              <div className="col-span-3">Record A Value</div>
              <div className="col-span-3">Record B Value</div>
              <div className="col-span-3">Merged Output</div>
            </div>

            <div className="divide-y divide-slate-200 text-xs">
              {ALL_FIELD_META.filter((m) => {
                const a = primaryContact.fields[m.key]?.value;
                const b = duplicateContact.fields[m.key]?.value;
                return Boolean(a || b);
              }).map((meta) => {
                const valA = primaryContact.fields[meta.key]?.value || '';
                const valB = duplicateContact.fields[meta.key]?.value || '';
                const current = selectedValues[meta.key] || '';

                return (
                  <div
                    key={meta.key}
                    className="grid grid-cols-12 items-center gap-2 px-4 py-2.5"
                  >
                    <div className="col-span-3 font-medium text-slate-800">
                      {meta.label}
                    </div>
                    <div className="col-span-3">
                      {valA ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedValues((prev) => ({ ...prev, [meta.key]: valA }))
                          }
                          className={`w-full text-left px-2 py-1 rounded border truncate ${
                            current === valA
                              ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {valA}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                    <div className="col-span-3">
                      {valB ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedValues((prev) => ({ ...prev, [meta.key]: valB }))
                          }
                          className={`w-full text-left px-2 py-1 rounded border truncate ${
                            current === valB
                              ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {valB}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={current}
                        onChange={(e) =>
                          setSelectedValues((prev) => ({
                            ...prev,
                            [meta.key]: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1 rounded border border-slate-300 font-mono text-slate-900"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Card-Based Field Comparison (< md) */}
          <div className="md:hidden space-y-3">
            {ALL_FIELD_META.filter((m) => {
              const a = primaryContact.fields[m.key]?.value;
              const b = duplicateContact.fields[m.key]?.value;
              return Boolean(a || b);
            }).map((meta) => {
              const valA = primaryContact.fields[meta.key]?.value || '';
              const valB = duplicateContact.fields[meta.key]?.value || '';
              const current = selectedValues[meta.key] || '';

              return (
                <div key={meta.key} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-800">{meta.label}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedValues((prev) => ({ ...prev, [meta.key]: valA }))}
                      disabled={!valA}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        current === valA && valA
                          ? 'border-slate-900 bg-slate-50 text-slate-900 font-semibold shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:opacity-30 cursor-pointer`}
                    >
                      <div className="text-[10px] text-slate-400 font-medium">Record A</div>
                      <div className="font-mono truncate mt-0.5">{valA || '—'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedValues((prev) => ({ ...prev, [meta.key]: valB }))}
                      disabled={!valB}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        current === valB && valB
                          ? 'border-slate-900 bg-slate-50 text-slate-900 font-semibold shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:opacity-30 cursor-pointer`}
                    >
                      <div className="text-[10px] text-slate-400 font-medium">Record B</div>
                      <div className="font-mono truncate mt-0.5">{valB || '—'}</div>
                    </button>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-medium mb-1">Final Merged Value:</div>
                    <input
                      type="text"
                      value={current}
                      onChange={(e) =>
                        setSelectedValues((prev) => ({ ...prev, [meta.key]: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 pb-[max(env(safe-area-inset-bottom),14px)]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-merge"
            type="button"
            disabled={isMerging}
            onClick={handleMerge}
            className="min-h-[38px] px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Confirm Merge & Deduplicate</span>
          </button>
        </div>
      </div>
    </div>
  );
};
