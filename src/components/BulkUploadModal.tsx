import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FileImage,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Trash2,
  Eye,
  Loader2,
  X,
  Sparkles,
  Phone,
  Mail,
  Download,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { ContactRecord, ContactFields } from '../types/card';
import {
  checkFourMandatoryFields,
  evaluateCoreAndRecordStatus,
  createEmptyContactFields,
  evaluateSingleField,
  findDuplicateContact,
  hasValidBusinessCardAnchor,
} from '../utils/cardValidator';
import {
  normalizeCardImage,
  maskQrOnNaturalImage,
} from '../utils/imageProcessor';
import {
  parseBusinessCardOcrText,
  computeOcrTextSimilarity,
} from '../utils/ocrParser';
import { computeScanHash } from '../utils/storage';
import { exportContactsToExcel } from '../utils/exporter';

export interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveContact: (contact: ContactRecord, isAutoSave: boolean) => Promise<void>;
  existingContacts: ContactRecord[];
  activeEvent?: string;
  availableEvents?: string[];
  onOpenFullReview: (contact: ContactRecord) => void;
  onNavigateToContacts?: () => void;
}

export interface StagedFileItem {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
}

export interface ProcessedBatchItem {
  id: string;
  fileName: string;
  frontImageBase64: string;
  backImageBase64?: string;
  contact?: ContactRecord;
  status: 'VERIFIED' | 'NEEDS_REVIEW' | 'DUPLICATE' | 'ERROR';
  missingLabels?: string[];
  duplicateTitle?: string;
  errorMsg?: string;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onSaveContact,
  existingContacts,
  activeEvent = 'Default',
  availableEvents = ['Default'],
  onOpenFullReview,
  onNavigateToContacts,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [pairingMode, setPairingMode] = useState<'SINGLE_SIDED' | 'TWO_SIDED_PAIRS'>('SINGLE_SIDED');
  const [selectedEvent, setSelectedEvent] = useState<string>(activeEvent || 'Default');

  // Stages: 'SELECT' | 'PROCESSING' | 'REVIEW'
  const [stage, setStage] = useState<'SELECT' | 'PROCESSING' | 'REVIEW'>('SELECT');
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);

  // Processing state
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [currentProcessingNum, setCurrentProcessingNum] = useState<number>(1);
  const [totalToProcess, setTotalToProcess] = useState<number>(0);
  const [currentFileLabel, setCurrentFileLabel] = useState<string>('');
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(null);
  const [processingStatusText, setProcessingStatusText] = useState<string>('Extracting Card Details...');
  const [isAborted, setIsAborted] = useState<boolean>(false);
  const abortRef = useRef<boolean>(false);

  // Completed items in batch
  const [processedItems, setProcessedItems] = useState<ProcessedBatchItem[]>([]);
  const [activeReviewFilter, setActiveReviewFilter] = useState<'ALL' | 'VERIFIED' | 'NEEDS_REVIEW' | 'DUPLICATES'>('ALL');

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToStaging(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStaging(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const addFilesToStaging = (newFiles: File[]) => {
    const validImages = newFiles.filter((f) => f.type.startsWith('image/'));
    if (validImages.length === 0) return;

    const newStaged: StagedFileItem[] = validImages.map((file) => ({
      id: `staged_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));

    setStagedFiles((prev) => [...prev, ...newStaged]);
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearAllStaged = () => {
    stagedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setStagedFiles([]);
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const startBatchProcessing = async () => {
    if (stagedFiles.length === 0) return;

    setStage('PROCESSING');
    abortRef.current = false;
    setIsAborted(false);
    setProcessedItems([]);

    const batchPairs: { frontFile: File; backFile?: File; label: string }[] = [];

    if (pairingMode === 'TWO_SIDED_PAIRS') {
      for (let i = 0; i < stagedFiles.length; i += 2) {
        batchPairs.push({
          frontFile: stagedFiles[i].file,
          backFile: stagedFiles[i + 1]?.file,
          label: stagedFiles[i + 1]
            ? `${stagedFiles[i].name} + ${stagedFiles[i + 1].name}`
            : stagedFiles[i].name,
        });
      }
    } else {
      stagedFiles.forEach((f) => {
        batchPairs.push({
          frontFile: f.file,
          label: f.name,
        });
      });
    }

    setTotalToProcess(batchPairs.length);
    setCompletedCount(0);
    setCurrentProcessingNum(1);
    setProcessingStatusText('Extracting Card Details...');
    const results: ProcessedBatchItem[] = new Array(batchPairs.length);
    const concurrency = 2; // Calibrated 2-worker pool to prevent Google Gemini 503 bursts and local CPU saturation
    let nextIndex = 0;
    let localCompleted = 0;

    const processItem = async (idx: number) => {
      if (abortRef.current) return;
      const item = batchPairs[idx];
      setCurrentProcessingNum(idx + 1);
      setCurrentFileLabel(item.label);
      setProcessingStatusText(`Extracting Card ${idx + 1} of ${batchPairs.length}...`);

      try {
        const rawFront = await fileToDataUrl(item.frontFile);
        setCurrentPreviewUrl(rawFront);
        const rawBack = item.backFile ? await fileToDataUrl(item.backFile) : undefined;

        const displayFront = await normalizeCardImage(rawFront, {
          cropToCardGuide: false,
          enhanceContrast: true,
        });
        const displayBack = rawBack
          ? await normalizeCardImage(rawBack, {
              cropToCardGuide: false,
              enhanceContrast: true,
            })
          : undefined;

        const scanHash = await computeScanHash(displayFront, displayBack);

        // Duplicate Check against currently existing + freshly saved in this batch
        const alreadyDoneContacts = results
          .map((r) => r?.contact)
          .filter(Boolean) as ContactRecord[];
        const combinedContacts = [...existingContacts, ...alreadyDoneContacts];

        const exactMatch = combinedContacts.find((c) => c.scanHash === scanHash);
        if (exactMatch) {
          const title =
            exactMatch.fields?.fullName?.value ||
            exactMatch.fields?.companyName?.value ||
            'Existing Lead';
          results[idx] = {
            id: `batch_res_${idx}`,
            fileName: item.label,
            frontImageBase64: displayFront,
            status: 'DUPLICATE',
            duplicateTitle: title,
            contact: exactMatch,
          };
          return;
        }

        // Call backend extraction with 18s circuit breaker timeout to guarantee it NEVER hangs
        let parsed: any = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 18000);

          const res = await fetch('/api/cards/extract', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              frontImageBase64: displayFront,
              backImageBase64: displayBack,
              scanHash,
              enginePreference: localStorage.getItem('cardvault_engine_pref') || 'hybrid',
            }),
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            if (data.extraction) {
              parsed = data.extraction;
            }
          }
        } catch (netErr: any) {
          console.warn(`[BulkUpload] Card ${idx + 1} extraction notice:`, netErr?.message || netErr);
        }

        // If card is unreadable or extraction failed, DO NOT parse filename!
        // Instead create empty contact flagged for review so database is not polluted.
        if (!parsed || parsed.isUnreadable) {
          const reason = parsed?.unreadableReason || 'Could not extract printed text from card image.';
          const emptyRecord: ContactRecord = {
            id: `CV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
            scanHash,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            overallStatus: 'NEEDS_REVIEW',
            savedWithoutCoreFields: true,
            missingCoreFieldLabels: ['Full Name', 'Company Name', 'Mobile Number', 'Email Address'],
            reviewReasons: [reason],
            frontImageBase64: displayFront,
            backImageBase64: displayBack,
            rawOcrFront: parsed?.rawOcrFront || '',
            rawOcrBack: parsed?.rawOcrBack || '',
            cardOrientation: 'horizontal',
            imageQualityIssues: parsed?.imageQualityIssues || ['blurry'],
            frontBackConflicts: [],
            fields: createEmptyContactFields(),
            customFields: [],
            eventName: selectedEvent || 'Default',
            sheetTab: selectedEvent || 'Default',
            syncStatus: 'LOCAL_ONLY',
          };

          // Keep in review deck as NEEDS_REVIEW so user can inspect and edit manually without polluting Google Sheets with empty ghost records
          results[idx] = {
            id: `batch_res_${idx}`,
            fileName: item.label,
            frontImageBase64: displayFront,
            backImageBase64: displayBack,
            contact: emptyRecord,
            status: 'NEEDS_REVIEW',
            missingLabels: ['Full Name', 'Company Name', 'Mobile Number', 'Email Address'],
          };
          return;
        }

        const personEntries = (parsed.allContacts || []).filter((p: any) =>
          hasValidBusinessCardAnchor(p.fields)
        );
        const primaryFields: ContactFields =
          personEntries.length > 0 ? personEntries[0].fields : parsed.fields;

        const dupCheck = findDuplicateContact(primaryFields, combinedContacts);
        if (dupCheck.duplicate) {
          const title =
            dupCheck.duplicate.fields?.fullName?.value ||
            dupCheck.duplicate.fields?.companyName?.value ||
            'Existing Lead';
          results[idx] = {
            id: `batch_res_${idx}`,
            fileName: item.label,
            frontImageBase64: displayFront,
            status: 'DUPLICATE',
            duplicateTitle: title,
            contact: dupCheck.duplicate,
          };
          return;
        }

        const mandatoryCheck = checkFourMandatoryFields(primaryFields);
        const coreVal = evaluateCoreAndRecordStatus(primaryFields, [], parsed.imageQualityIssues);

        const isFullyVerified = mandatoryCheck.allFourPresent && coreVal.overallStatus === 'VERIFIED';
        const finalStatus = isFullyVerified ? 'VERIFIED' : 'NEEDS_REVIEW';

        const recordId = `CV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const newRecord: ContactRecord = {
          id: recordId,
          scanHash,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          overallStatus: finalStatus,
          savedWithoutCoreFields: !isFullyVerified,
          missingCoreFieldLabels: mandatoryCheck.missingMandatoryLabels,
          reviewReasons: [
            ...mandatoryCheck.missingMandatoryLabels.map((l) => `Missing ${l}`),
            ...coreVal.uncertainCoreFields.map((u) => `${u.label}: ${u.reason}`),
          ],
          frontImageBase64: displayFront,
          backImageBase64: displayBack,
          rawOcrFront: parsed.rawOcrFront || '',
          rawOcrBack: parsed.rawOcrBack || '',
          cardOrientation: 'horizontal',
          imageQualityIssues: parsed.imageQualityIssues || [],
          frontBackConflicts: [],
          fields: primaryFields,
          customFields: parsed.customFields || [],
          eventName: selectedEvent || 'Default',
          sheetTab: selectedEvent || 'Default',
          syncStatus: 'SYNCED',
        };

        // Auto-save to Contacts database (and Google Sheets) immediately!
        try {
          await onSaveContact(newRecord, true);
        } catch (saveErr) {
          console.warn('[BulkUpload] Save contact notice:', saveErr);
        }

        results[idx] = {
          id: `batch_res_${idx}`,
          fileName: item.label,
          frontImageBase64: displayFront,
          backImageBase64: displayBack,
          contact: newRecord,
          status: finalStatus,
          missingLabels: mandatoryCheck.missingMandatoryLabels,
        };
      } catch (err: any) {
        console.error('Failed to process card in bulk upload:', err);
        results[idx] = {
          id: `batch_res_${idx}`,
          fileName: item.label,
          frontImageBase64: '',
          status: 'ERROR',
          errorMsg: err?.message || 'Processing failed',
        };
      } finally {
        localCompleted++;
        setCompletedCount(localCompleted);
      }
    };

    const worker = async () => {
      while (nextIndex < batchPairs.length) {
        if (abortRef.current) break;
        const i = nextIndex++;
        await processItem(i);
        if (nextIndex < batchPairs.length) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, batchPairs.length) }, () => worker())
    );

    // Provide smooth visual 100% completion before opening review deck
    setProcessingStatusText('All cards processed! Assembling review deck...');
    setCompletedCount(batchPairs.length);
    setCurrentProcessingNum(batchPairs.length);
    await new Promise((r) => setTimeout(r, 450));

    setProcessedItems(results.filter(Boolean));
    setStage('REVIEW');
  };

  const handleCancelProcessing = () => {
    abortRef.current = true;
    setIsAborted(true);
  };

  const handleExportBatch = () => {
    const validRecords = processedItems.map((p) => p.contact).filter(Boolean) as ContactRecord[];
    if (validRecords.length === 0) return;
    exportContactsToExcel(validRecords, `CardVault_Batch_${selectedEvent || 'Export'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const verifiedCount = processedItems.filter((p) => p.status === 'VERIFIED').length;
  const reviewCount = processedItems.filter((p) => p.status === 'NEEDS_REVIEW').length;
  const duplicateCount = processedItems.filter((p) => p.status === 'DUPLICATE').length;
  const errorCount = processedItems.filter((p) => p.status === 'ERROR').length;

  const filteredReviewItems = processedItems.filter((p) => {
    if (activeReviewFilter === 'VERIFIED') return p.status === 'VERIFIED';
    if (activeReviewFilter === 'NEEDS_REVIEW') return p.status === 'NEEDS_REVIEW';
    if (activeReviewFilter === 'DUPLICATES') return p.status === 'DUPLICATE';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200/80 shadow-2xs">
              <UploadCloud className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Bulk Card Upload & Batch Review
              </h2>
              <p className="text-xs text-slate-500">
                Upload up to 50+ business card photos at once with auto-segregation.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* STAGE 1: File Selection & Configuration */}
          {stage === 'SELECT' && (
            <div className="space-y-5">
              {/* Settings Toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Card Side Mode
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPairingMode('SINGLE_SIDED')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        pairingMode === 'SINGLE_SIDED'
                          ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Single-Sided (1 photo = 1 card)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPairingMode('TWO_SIDED_PAIRS')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        pairingMode === 'TWO_SIDED_PAIRS'
                          ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      2-Sided Pairs (Front + Back)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Assign Event / Exhibition Tag
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedEvent}
                      onChange={(e) => setSelectedEvent(e.target.value)}
                      className="w-full py-1.5 px-3 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-800 shadow-2xs focus:ring-1 focus:ring-slate-900"
                    >
                      {availableEvents.map((evt) => (
                        <option key={evt} value={evt}>
                          {evt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-slate-900 bg-slate-100/70'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  id="bulk-upload-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />

                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-3 border border-slate-200/80 shadow-2xs">
                  <UploadCloud className="w-6 h-6 text-slate-600" />
                </div>

                <div className="text-sm font-semibold text-slate-900 mb-1">
                  Drag & Drop Business Card Photos Here
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-3">
                  Or click to select files from your phone gallery or desktop folder. Supports JPG, PNG, WEBP, and multi-file selection.
                </p>

                <button
                  type="button"
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FileImage className="w-3.5 h-3.5 text-slate-300" />
                  <span>Browse Photos</span>
                </button>
              </div>

              {/* Staged Files Preview Grid */}
              {stagedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Staged Files ({stagedFiles.length}{' '}
                      {pairingMode === 'TWO_SIDED_PAIRS'
                        ? `· ${Math.ceil(stagedFiles.length / 2)} cards`
                        : 'cards'}
                      )
                    </span>
                    <button
                      type="button"
                      onClick={clearAllStaged}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-2xl bg-slate-50">
                    {stagedFiles.map((item, idx) => (
                      <div
                        key={item.id}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 bg-white shadow-xs"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="w-full h-24 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeStagedFile(item.id)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="p-1 text-[10px] text-slate-600 truncate font-mono">
                          #{idx + 1} {item.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGE 2: Live Processing */}
          {stage === 'PROCESSING' && (
            <div className="space-y-6 py-6 text-center max-w-lg mx-auto">
              <div className="relative mx-auto w-48 h-32 rounded-2xl border-2 border-blue-500 shadow-xl overflow-hidden bg-slate-900 flex items-center justify-center">
                {currentPreviewUrl ? (
                  <img
                    src={currentPreviewUrl}
                    alt="Processing Card"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-blue-600/90 text-white text-[10px] font-mono font-bold">
                  Card {Math.min(currentProcessingNum, totalToProcess || 1)} of {totalToProcess}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {processingStatusText}
                </h3>
                <p className="text-xs text-slate-500 font-mono truncate max-w-md mx-auto">
                  {currentFileLabel}
                </p>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden max-w-md mx-auto">
                  <div
                    className="h-full bg-slate-900 transition-all duration-200"
                    style={{
                      width: `${totalToProcess > 0 ? Math.min(100, (completedCount / totalToProcess) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="text-xs font-mono font-medium text-slate-700">
                  {completedCount >= totalToProcess && totalToProcess > 0
                    ? '100% Completed'
                    : `${Math.round(totalToProcess > 0 ? (completedCount / totalToProcess) * 100 : 0)}% Completed (${completedCount}/${totalToProcess})`}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelProcessing}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer"
                >
                  Cancel Remaining
                </button>
              </div>
            </div>
          )}

          {/* STAGE 3: Comprehensive Batch Review Deck */}
          {stage === 'REVIEW' && (
            <div className="space-y-4">
              {/* Summary Stats Banner */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Batch Upload Complete ({processedItems.length} Cards Processed)</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    All cards are saved into your Contacts Database and synced to the active event.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportBatch}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Export Batch (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveReviewFilter('ALL')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeReviewFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All ({processedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReviewFilter('VERIFIED')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeReviewFilter === 'VERIFIED'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Verified ({verifiedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReviewFilter('NEEDS_REVIEW')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeReviewFilter === 'NEEDS_REVIEW'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Needs Review ({reviewCount})
                </button>
                {duplicateCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveReviewFilter('DUPLICATES')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      activeReviewFilter === 'DUPLICATES'
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Duplicates ({duplicateCount})
                  </button>
                )}
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[420px] overflow-y-auto pr-1">
                {filteredReviewItems.map((item) => {
                  const contact = item.contact;
                  const fullName = contact?.fields?.fullName?.value || item.duplicateTitle || 'Business Card';
                  const company = contact?.fields?.companyName?.value || '';
                  const role = contact?.fields?.designation?.value || '';
                  const phone = contact?.fields?.mobileNumber?.value || contact?.fields?.officePhone?.value || '';
                  const email = contact?.fields?.email?.value || '';

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-3 flex flex-col justify-between space-y-2.5 transition-all shadow-xs ${
                        item.status === 'VERIFIED'
                          ? 'bg-white border-emerald-300'
                          : item.status === 'NEEDS_REVIEW'
                          ? 'bg-amber-50/50 border-amber-300'
                          : item.status === 'DUPLICATE'
                          ? 'bg-slate-50 border-slate-300'
                          : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Top: Status Capsule & Thumbnail */}
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              item.status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'NEEDS_REVIEW'
                                ? 'bg-amber-100 text-amber-800'
                                : item.status === 'DUPLICATE'
                                ? 'bg-slate-200 text-slate-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {item.status === 'VERIFIED' ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                            )}
                            <span>
                              {item.status === 'VERIFIED'
                                ? 'Verified'
                                : item.status === 'NEEDS_REVIEW'
                                ? `Needs Review (${item.missingLabels?.join(', ') || 'Fields'})`
                                : item.status === 'DUPLICATE'
                                ? 'Duplicate'
                                : 'Error'}
                            </span>
                          </span>

                          {item.frontImageBase64 && (
                            <img
                              src={item.frontImageBase64}
                              alt={fullName}
                              className="w-12 h-8 rounded-lg object-cover border border-slate-200 shadow-2xs shrink-0"
                            />
                          )}
                        </div>

                        {/* Middle: Details */}
                        <div>
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {fullName}
                          </div>
                          {(role || company) && (
                            <p className="text-xs text-slate-600 font-medium truncate">
                              {[role, company].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>

                        {/* Contact Chips */}
                        <div className="space-y-1 text-xs">
                          {phone && (
                            <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px] truncate">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{phone}</span>
                            </div>
                          )}
                          {email && (
                            <div className="flex items-center gap-1.5 text-blue-700 font-mono text-[11px] truncate">
                              <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                              <span className="truncate">{email}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bottom Action Deck */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
                        {contact && (
                          <button
                            type="button"
                            onClick={() => onOpenFullReview(contact)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Review</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Deck */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
          {stage === 'SELECT' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-800 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={stagedFiles.length === 0}
                onClick={startBatchProcessing}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-2xs disabled:opacity-40 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span>Process {stagedFiles.length} Cards</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {stage === 'PROCESSING' && (
            <div className="w-full text-center text-xs text-slate-500 font-medium">
              Processing cards with OCR & Gemini Vision AI. Please wait...
            </div>
          )}

          {stage === 'REVIEW' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStage('SELECT');
                  clearAllStaged();
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                <span>Upload Another Batch</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onNavigateToContacts) onNavigateToContacts();
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Done & View in Contacts</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
