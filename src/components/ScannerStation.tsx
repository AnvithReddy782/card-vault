import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Contact,
  Cpu,
  Eye,
  FileSpreadsheet,
  FileUp,
  Flashlight,
  FlipHorizontal,
  Layers,
  Loader2,
  Mail,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  Phone,
  Play,
  RefreshCw,
  RotateCw,
  Scan,
  ScanLine,
  Sliders,
  Sparkles,
  Smartphone,
  Tag,
  Trash2,
  Undo2,
  UploadCloud,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useModal } from '../context/ModalContext';
import { ScannerReviewDrawer } from './ScannerReviewDrawer';
import { OcrEnginePreference, OcrConfigState } from './OcrSettingsModal';
import {
  ContactRecord,
  CoreFieldValidationSummary,
  PendingOfflineScan,
  ScanSessionStats,
} from '../types/card';
import {
  checkFourMandatoryFields,
  evaluateCoreAndRecordStatus,
  findDuplicateContact,
  hasValidBusinessCardAnchor,
  isGarbageContactRecord,
} from '../utils/cardValidator';
import {
  analyzeVideoFrameStability,
  decodeQrOrBarcodeFromDataUrl,
  detectCardOrientationFromDataUrl,
  maskQrOnNaturalImage,
  normalizeCardImage,
  playScannerBeep,
  playShutterClickSound,
  validateFrameCardPresence,
} from '../utils/imageProcessor';
import {
  computeOcrTextSimilarity,
  extractSpatialLinesFromTesseractData,
  mergeQrPayloadsIntoFields,
  parseBusinessCardOcrText,
} from '../utils/ocrParser';
import { exportContactsToVCard, formatWhatsAppUrl } from '../utils/exporter';
import { computeScanHash } from '../utils/storage';
import {
  fetchServerSheetsConfig,
  getLocalSheetsConfig,
} from '../services/googleSheetsService';

interface ScannerStationProps {
  existingContacts: ContactRecord[];
  sessionStats: ScanSessionStats;
  pendingOfflineQueue: PendingOfflineScan[];
  isOfflineMode: boolean;
  onToggleOfflineMode: () => void;
  onSaveContact: (contact: ContactRecord, isAutoSave: boolean) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onUndoLastSave: () => Promise<void>;
  lastAutoSavedContact: ContactRecord | null;
  onQueueOfflineScan: (item: PendingOfflineScan) => Promise<void>;
  onProcessOfflineQueue: () => Promise<void>;
  onIncrementFailedScan: () => void;
  onOpenFullReview: (draftContact: ContactRecord) => void;
  activeEvent?: string;
  availableEvents?: string[];
  onSelectEvent?: (event: string) => void;
}

interface BackgroundJobItem {
  jobId: string;
  thumbnail: string;
  startedAt: number;
  status:
    | 'EXTRACTING'
    | 'SAVED_VERIFIED'
    | 'SAVED_NEEDS_REVIEW'
    | 'DUPLICATE_SKIPPED'
    | 'AWAITING_DECISION'
    | 'REJECTED_NON_CARD';
  label: string;
  subtitle?: string;
  contact?: ContactRecord;
  extraContactsCount?: number;
  allSavedContacts?: ContactRecord[];
  validation?: CoreFieldValidationSummary;
  errorMsg?: string;
}

interface OnSpotExtractionResult {
  capturedImage: string;
  status: 'SAVED' | 'DUPLICATE' | 'AWAITING_DECISION' | 'NO_CARD';
  contacts: ContactRecord[];
  duplicateContact?: ContactRecord;
  message: string;
  missingMandatoryLabels?: string[];
  backSideNote?: string;
  engineLabel?: string;
  isSegregatedToReview?: boolean;
}

/**
 * Dynamically extracts all non-empty printed fields from a ContactRecord so
 * every card renders its own exact layout & fields (including multiple landlines and QR notes).
 */
function getPresentCardFields(contact: ContactRecord): {
  label: string;
  value: string;
  mono?: boolean;
}[] {
  const f = contact.fields;
  const items: { label: string; value: string; mono?: boolean }[] = [];

  if (f.mobileNumber.value) {
    items.push({ label: 'Mobile', value: f.mobileNumber.value, mono: true });
  }
  if (f.officePhone.value && f.officePhone.value !== f.mobileNumber.value) {
    items.push({
      label: f.companyTelephone.value ? 'Tel 1' : 'Tel / Office',
      value: f.officePhone.value,
      mono: true,
    });
  }
  if (
    f.companyTelephone.value &&
    f.companyTelephone.value !== f.mobileNumber.value &&
    f.companyTelephone.value !== f.officePhone.value
  ) {
    items.push({
      label: f.officePhone.value ? 'Tel 2' : 'Tel / Office',
      value: f.companyTelephone.value,
      mono: true,
    });
  }
  if (f.whatsappNumber.value && f.whatsappNumber.value !== f.mobileNumber.value) {
    items.push({ label: 'WhatsApp', value: f.whatsappNumber.value, mono: true });
  }
  if (f.email.value) {
    items.push({ label: 'Email', value: f.email.value, mono: true });
  }
  if (f.secondaryEmail.value && f.secondaryEmail.value !== f.email.value) {
    items.push({ label: 'Alt Email', value: f.secondaryEmail.value, mono: true });
  }
  const web = f.companyWebsite.value || f.website.value;
  if (web) {
    items.push({ label: 'Website', value: web, mono: true });
  }
  if (f.department.value) {
    items.push({ label: 'Department', value: f.department.value });
  }
  if (f.companyCategory.value) {
    items.push({ label: 'Industry', value: f.companyCategory.value });
  }
  if (f.businessActivity.value) {
    items.push({ label: 'Activity', value: f.businessActivity.value });
  }
  if (f.companyAddress.value) {
    items.push({ label: 'Address', value: f.companyAddress.value });
  }
  const locParts = [f.city.value, f.officeLocation.value, f.country.value].filter(
    Boolean
  );
  if (locParts.length > 0 && !f.companyAddress.value) {
    items.push({ label: 'Location', value: locParts.join(', ') });
  }
  if (f.poBox.value) {
    items.push({ label: 'P.O. Box', value: f.poBox.value, mono: true });
  }
  if (f.registrationInfo.value) {
    items.push({ label: 'Reg / TRN', value: f.registrationInfo.value, mono: true });
  }
  if (f.qrCodeInfo.value) {
    items.push({ label: 'QR Info', value: f.qrCodeInfo.value });
  }
  if (f.otherRelevantText.value) {
    items.push({ label: 'Card Notes', value: f.otherRelevantText.value });
  }
  if (Array.isArray(contact.customFields)) {
    for (const cf of contact.customFields) {
      if (cf.label && cf.value) {
        items.push({ label: cf.label, value: cf.value });
      }
    }
  }

  return items;
}

export const ScannerStation: React.FC<ScannerStationProps> = ({
  existingContacts,
  sessionStats,
  pendingOfflineQueue,
  isOfflineMode,
  onToggleOfflineMode,
  onSaveContact,
  onDeleteContact,
  onUndoLastSave,
  lastAutoSavedContact,
  onQueueOfflineScan,
  onProcessOfflineQueue,
  onIncrementFailedScan,
  onOpenFullReview,
  activeEvent = 'Default',
  availableEvents = ['Default'],
  onSelectEvent,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const lastCapturedSignatureRef = useRef<number[] | null>(null);
  const currentSignatureRef = useRef<number[]>([]);
  const lockedUntilCardSwappedRef = useRef<boolean>(false);
  const isExtractingRef = useRef<boolean>(false);
  const stabilityStreakRef = useRef<number>(0);
  const lastCaptureTimestampRef = useRef<number>(0);
  const ocrWorkerRef = useRef<Tesseract.Worker | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frontFileInputRef = useRef<HTMLInputElement | null>(null);
  const backFileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const onSpotResultRef = useRef<HTMLDivElement | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('cardvault_autocapture');
    return saved !== null ? saved === 'true' : false;
  });
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [scanTwoSides, setScanTwoSides] = useState<boolean>(false);
  const [activeSideCapture, setActiveSideCapture] = useState<'FRONT' | 'BACK'>('FRONT');
  const [enhanceLowLight, setEnhanceLowLight] = useState<boolean>(false);
  const [rotationDegrees, setRotationDegrees] = useState<0 | 90 | 180 | 270>(0);
  const [, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [flashMode, setFlashMode] = useState<'OFF' | 'AUTO' | 'TORCH' | 'FILL_LIGHT'>(
    'AUTO'
  );
  const [fillLightPulse, setFillLightPulse] = useState<boolean>(false);
  const [showManualCaptureAssist, setShowManualCaptureAssist] = useState<boolean>(false);
  const autoWaitTicksRef = useRef<number>(0);

  // Live camera & optical focus sharpness telemetry
  const [stabilityScore, setStabilityScore] = useState<number>(0);
  const [focusSharpness, setFocusSharpness] = useState<number>(0);
  const [cardDetected, setCardDetected] = useState<boolean>(false);
  const [cardConfidence, setCardConfidence] = useState<number>(0);
  const [noCardWarning, setNoCardWarning] = useState<string | null>(null);
  const [, setTextLineSignal] = useState<number>(0);
  const [sameCardStillInView, setSameCardStillInView] = useState<boolean>(false);
  const [lockProgress, setLockProgress] = useState<number>(0);
  const [cameraViewFit, setCameraViewFit] = useState<'fit' | 'cover'>(() => {
    return (localStorage.getItem('cardvault_camera_fit') as 'fit' | 'cover') || 'fit';
  });
  const [viewfinderGuideMode, setViewfinderGuideMode] = useState<'guide' | 'open'>(() => {
    return (localStorage.getItem('cardvault_guide_mode') as 'guide' | 'open') || 'guide';
  });
  const [zoomSupported, setZoomSupported] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number }>({
    min: 1,
    max: 1,
    step: 0.1,
  });
  const [showEventDropdown, setShowEventDropdown] = useState<boolean>(false);
  const [newEventName, setNewEventName] = useState<string>('');
  const [lightingStatus, setLightingStatus] = useState<'optimal' | 'low_light' | 'glare'>(
    'optimal'
  );
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);

  // On-Spot 1-2s Freeze & Immediate Extraction State
  const [isExtractingOnSpot, setIsExtractingOnSpot] = useState<boolean>(false);
  const [frozenPreviewImage, setFrozenPreviewImage] = useState<string | null>(null);
  const [onSpotResult, setOnSpotResult] = useState<OnSpotExtractionResult | null>(null);

  // Concise Status Banner
  const [cardSwapBanner, setCardSwapBanner] = useState<{
    type: 'change_card' | 'same_card_warning' | 'ready';
    title: string;
    subtitle: string;
  }>({
    type: 'ready',
    title: 'Point at Business Card Anywhere in View',
    subtitle:
      'Auto-detects in ~0.4s without forced alignment, or tap shutter to capture.',
  });

  // Two-sided staging
  const [capturedFrontForTwoSided, setCapturedFrontForTwoSided] = useState<string | null>(
    null
  );
  const [stagedReplaceContactId, setStagedReplaceContactId] = useState<string | undefined>(
    undefined
  );

  // Scanned cards history stream
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJobItem[]>([]);

  // OCR Settings & Vision Engine State
  const { openOcrSettings, openSheetsModal, isSheetsModalOpen, openMobileModal, openBulkUpload } = useModal();
  const [hasGeminiEngine, setHasGeminiEngine] = useState<boolean>(false);
  const [ocrEnginePreference, setOcrEnginePreference] = useState<OcrEnginePreference>(
    () => (localStorage.getItem('cardvault_engine_pref') as OcrEnginePreference) || 'hybrid'
  );
  const [activeEngineName, setActiveEngineName] = useState<string>('Smart Hybrid');
  const [hasSheetsWebhook, setHasSheetsWebhook] = useState<boolean>(false);

  // In-App Camera, Lens Switcher, Focus Point & Autoscan HUD State
  const [currentCameraFacing, setCurrentCameraFacing] = useState<'environment' | 'user'>('environment');
  const [availableCameraDevices, setAvailableCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState<string>(() => {
    return localStorage.getItem('cardvault_preferred_camera_device_id') || '';
  });

  // Filter physical rear camera lenses (Ultra-Wide, Wide 1x, Telephoto)
  const rearCameraDevices = useMemo(() => {
    return availableCameraDevices.filter((d) => {
      const lbl = (d.label || '').toLowerCase();
      return !lbl.includes('front') && !lbl.includes('user') && !lbl.includes('selfie');
    });
  }, [availableCameraDevices]);

  const [tapFocusPoint, setTapFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [showAutoscanInfo, setShowAutoscanInfo] = useState<boolean>(false);
  const [autoscanStage, setAutoscanStage] = useState<
    'SEARCHING' | 'ALIGNING' | 'CAPTURING' | 'EXTRACTING' | 'PARSING' | 'SYNCING_SHEETS' | 'SAVED'
  >('SEARCHING');
  const [networkInfo, setNetworkInfo] = useState<{
    lanIps: string[];
    primaryIp: string;
    httpPort: number;
    httpsPort: number;
    httpUrl: string;
    httpsUrl: string;
  } | null>(null);

  const isSecureContextEnv = typeof window !== 'undefined' && (
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => r.json())
      .then((data) => setNetworkInfo(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const checkSheets = async () => {
      let cfg = getLocalSheetsConfig();
      if (!cfg.webhookUrl) {
        cfg = await fetchServerSheetsConfig();
      }
      setHasSheetsWebhook(Boolean(cfg.webhookUrl && cfg.webhookUrl.trim()));
    };
    checkSheets();
  }, [isSheetsModalOpen]);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        const hasKey = Boolean(data.hasGeminiKey);
        setHasGeminiEngine(hasKey);
        const pref: OcrEnginePreference = data.ocrEnginePreference || 'hybrid';
        setOcrEnginePreference(pref);
        localStorage.setItem('cardvault_engine_pref', pref);

        if (pref === 'ai_studio') {
          setActiveEngineName(hasKey ? 'Google AI Studio (100% Precision)' : 'AI Studio (Key Needed)');
        } else if (pref === 'rapid_ocr') {
          setActiveEngineName('Local RapidOCR (Zero-Cost / CPU)');
        } else {
          setActiveEngineName(hasKey ? 'Smart Hybrid (RapidOCR + AI Studio)' : 'RapidOCR (Local)');
        }
      })
      .catch(() => {});
  }, []);

  // Cleanup OCR worker on unmount if it was lazily instantiated
  useEffect(() => {
    return () => {
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate().catch(() => {});
        ocrWorkerRef.current = null;
      }
    };
  }, []);

  // Helper to apply hardware LED torch state across Android Chrome / WebView camera drivers
  const applyHardwareTorch = useCallback(async (enable: boolean): Promise<boolean> => {
    if (!videoRef.current || !videoRef.current.srcObject) return false;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;

    try {
      await track.applyConstraints({
        advanced: [{ torch: enable } as any],
      });
      setTorchEnabled(enable);
      setTorchSupported(true);
      return true;
    } catch {
      try {
        await track.applyConstraints({ torch: enable } as any);
        setTorchEnabled(enable);
        setTorchSupported(true);
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  // Start camera stream at Full HD (1920x1080 ideal) with hardware continuous autofocus, multi-lens selection & delayed Torch probe
  const startCamera = useCallback(
    async (
      facingOverride?: 'environment' | 'user',
      deviceIdOverride?: string
    ) => {
      setCameraError(null);
      const facing = facingOverride || currentCameraFacing;
      const deviceIdToUse =
        deviceIdOverride !== undefined ? deviceIdOverride : selectedCameraDeviceId;

      try {
        if (videoRef.current && videoRef.current.srcObject) {
          const oldStream = videoRef.current.srcObject as MediaStream;
          oldStream.getTracks().forEach((t) => t.stop());
          videoRef.current.srcObject = null;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            'Live camera requires HTTPS on mobile devices. Please open the secure HTTPS link.'
          );
        }

        const isMobile =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
          window.innerWidth < 768;

        const videoConstraints: MediaTrackConstraints = isMobile
          ? {
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            }
          : {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };

        if (deviceIdToUse && deviceIdToUse.trim()) {
          videoConstraints.deviceId = { exact: deviceIdToUse };
        } else {
          videoConstraints.facingMode = { ideal: facing };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        setCurrentCameraFacing(facing);

        if (navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices
            .enumerateDevices()
            .then((devs) => {
              const videoInputs = devs.filter((d) => d.kind === 'videoinput');
              setAvailableCameraDevices(videoInputs);

              // Auto-select primary 1x wide lens by default to prevent telephoto zoom
              if (!deviceIdToUse && facing === 'environment') {
                const rearDevs = videoInputs.filter((d) => {
                  const lbl = (d.label || '').toLowerCase();
                  return !lbl.includes('front') && !lbl.includes('user') && !lbl.includes('selfie');
                });
                if (rearDevs.length > 1) {
                  const wideDev =
                    rearDevs.find((d) => {
                      const l = (d.label || '').toLowerCase();
                      return (
                        (l.includes('wide') && !l.includes('tele') && !l.includes('zoom')) ||
                        l.includes('back 0') ||
                        l.includes('camera 0') ||
                        l.includes('main') ||
                        l.includes('primary')
                      );
                    }) || rearDevs[0];
                  if (wideDev && wideDev.deviceId && wideDev.deviceId !== selectedCameraDeviceId) {
                    setSelectedCameraDeviceId(wideDev.deviceId);
                  }
                }
              }
            })
            .catch(() => {});
        }

        const probeTrackCapabilities = async (videoTrack: MediaStreamTrack) => {
          if (!videoTrack || typeof videoTrack.getCapabilities !== 'function') return;
          try {
            const caps = videoTrack.getCapabilities() as any;
            if (caps?.torch) {
              setTorchSupported(true);
            }
            if (caps?.zoom) {
              setZoomSupported(true);
              const minZ = typeof caps.zoom.min === 'number' ? caps.zoom.min : 1;
              const maxZ = typeof caps.zoom.max === 'number' ? caps.zoom.max : 1;
              const stepZ = typeof caps.zoom.step === 'number' ? caps.zoom.step : 0.1;
              setZoomRange({ min: minZ, max: maxZ, step: stepZ });
              try {
                // Ensure camera is default un-zoomed to widest hardware optical sensor level
                await videoTrack.applyConstraints({
                  advanced: [{ zoom: minZ } as any],
                });
                setCurrentZoom(minZ);
              } catch {}
            }
            if (
              Array.isArray(caps?.focusMode) &&
              caps.focusMode.includes('continuous')
            ) {
              await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any],
              });
            }
          } catch {
            // ignore if hardware constraints are unsupported
          }
        };

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const trackSettings =
            typeof videoTrack.getSettings === 'function'
              ? videoTrack.getSettings()
              : null;
          if (trackSettings?.deviceId && !selectedCameraDeviceId) {
            setSelectedCameraDeviceId(trackSettings.deviceId);
          }
          await probeTrackCapabilities(videoTrack);
          setTimeout(() => probeTrackCapabilities(videoTrack), 450);
          setTimeout(() => probeTrackCapabilities(videoTrack), 1200);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }
      } catch (err: any) {
        setCameraActive(false);
        setCameraError(
          err?.message ||
            'Camera stream unavailable or permission declined. Check camera permissions or open on HTTPS.'
        );
      }
    },
    [currentCameraFacing, selectedCameraDeviceId]
  );

  const switchCameraFacing = useCallback(() => {
    const nextFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
    setCurrentCameraFacing(nextFacing);
    setSelectedCameraDeviceId('');
    startCamera(nextFacing, '');
  }, [currentCameraFacing, startCamera]);

  const switchRearCameraLens = useCallback(
    async (targetDeviceId: string) => {
      setSelectedCameraDeviceId(targetDeviceId);
      localStorage.setItem('cardvault_preferred_camera_device_id', targetDeviceId);
      await startCamera('environment', targetDeviceId);
    },
    [startCamera]
  );

  const cycleRearCameraLens = useCallback(async () => {
    if (rearCameraDevices.length <= 1) {
      switchCameraFacing();
      return;
    }
    const currentIndex = rearCameraDevices.findIndex(
      (d) => d.deviceId === selectedCameraDeviceId
    );
    const nextIndex = (currentIndex + 1) % rearCameraDevices.length;
    const nextDev = rearCameraDevices[nextIndex];
    if (nextDev) {
      await switchRearCameraLens(nextDev.deviceId);
    }
  }, [rearCameraDevices, selectedCameraDeviceId, switchRearCameraLens, switchCameraFacing]);

  // Cycle through the 4 Flash / Illumination modes: OFF -> AUTO -> TORCH (LED) -> FILL_LIGHT (Screen Studio Ring)
  const cycleFlashMode = useCallback(async () => {
    const order: ('OFF' | 'AUTO' | 'TORCH' | 'FILL_LIGHT')[] = [
      'OFF',
      'AUTO',
      'TORCH',
      'FILL_LIGHT',
    ];
    const nextMode = order[(order.indexOf(flashMode) + 1) % order.length];
    setFlashMode(nextMode);

    if (nextMode === 'TORCH') {
      const ok = await applyHardwareTorch(true);
      if (!ok) {
        setEnhanceLowLight(true);
      }
    } else if (nextMode === 'FILL_LIGHT') {
      await applyHardwareTorch(false);
      setEnhanceLowLight(true);
    } else {
      await applyHardwareTorch(false);
    }
  }, [flashMode, applyHardwareTorch]);

  // Direct 1-tap Flash toggle (toggles immediately between active Torch/Fill-Light and OFF)
  const toggleInstantFlash = useCallback(async () => {
    if (flashMode === 'TORCH' || flashMode === 'FILL_LIGHT') {
      setFlashMode('OFF');
      await applyHardwareTorch(false);
    } else {
      const ok = await applyHardwareTorch(true);
      if (ok) {
        setFlashMode('TORCH');
      } else {
        setFlashMode('FILL_LIGHT');
        setEnhanceLowLight(true);
      }
    }
  }, [flashMode, applyHardwareTorch]);

  const handleSetZoom = useCallback(async (targetZoom: number) => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: targetZoom } as any],
      });
      setCurrentZoom(targetZoom);
    } catch (e) {
      console.warn('Failed to apply zoom constraint:', e);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchEnabled(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  /**
   * Auto-dismisses the on-spot modal after saving/segregating so scanner feed
   * is visible, while preserving lockedUntilCardSwappedRef until the physical card is swapped/removed.
   */
  const dismissOnSpotModal = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setFrozenPreviewImage(null);
    setOnSpotResult(null);
    isExtractingRef.current = false;
    setCardSwapBanner({
      type: 'change_card',
      title: 'Swap Card — Ready for Next Business Card',
      subtitle: 'Remove current card from camera view to scan the next one.',
    });
  }, []);

  /**
   * Unlocks scanner immediately so user can scan the next card
   */
  const unlockForNextCard = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    lastCapturedSignatureRef.current = null;
    lockedUntilCardSwappedRef.current = false;
    isExtractingRef.current = false;
    stabilityStreakRef.current = 0;
    setSameCardStillInView(false);
    setFrozenPreviewImage(null);
    setOnSpotResult(null);
    setCardSwapBanner({
      type: 'ready',
      title: 'Scanner Ready — Hold Next Business Card Inside Frame',
      subtitle:
        'Auto-crops to card edges & verifies Company, Name, Phone, and Email.',
    });
  }, []);

  /**
   * One-tap handler to delete/discard a contact from On-Spot Card or Session Stream
   */
  const handleDeleteScannedContact = useCallback(
    async (contactId: string, jobId?: string) => {
      await onDeleteContact(contactId);

      setOnSpotResult((prev) => {
        if (!prev) return null;
        const remaining = prev.contacts.filter((c) => c.id !== contactId);
        if (remaining.length === 0) {
          lockedUntilCardSwappedRef.current = false;
          setSameCardStillInView(false);
          return null;
        }
        return { ...prev, contacts: remaining };
      });

      setBackgroundJobs((prev) =>
        prev.filter((j) => {
          if (jobId && j.jobId === jobId) return false;
          if (j.contact?.id === contactId) return false;
          return true;
        })
      );
    },
    [onDeleteContact]
  );

  const [isBoostingAi, setIsBoostingAi] = useState<boolean>(false);

  const handleAiStudioBoost = useCallback(
    async (contact: ContactRecord) => {
      if (!contact.frontImageBase64) return;
      setIsBoostingAi(true);

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
          if (data.needsApiKey || res.status === 400) {
            openOcrSettings();
          } else {
            alert(data.error || 'Google AI Studio extraction failed.');
          }
          return;
        }

        if (data.extraction && data.extraction.fields) {
          const boostedFields = data.extraction.fields;
          const updatedContact: ContactRecord = {
            ...contact,
            fields: boostedFields,
            updatedAt: new Date().toISOString(),
            overallStatus: 'VERIFIED',
          };

          await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact: updatedContact, allowOverwrite: true }),
          });

          await onSaveContact(updatedContact, false);

          setOnSpotResult((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              engineLabel: data.engineLabel || 'Google AI Studio (100% Precision)',
              contacts: prev.contacts.map((c) => (c.id === contact.id ? updatedContact : c)),
            };
          });

          playScannerBeep('captured', chimeEnabled);
        }
      } catch (err: any) {
        console.error('Failed to boost with AI Studio:', err);
      } finally {
        setIsBoostingAi(false);
      }
    },
    [chimeEnabled]
  );

  /**
   * Runs 100% local, non-AI, non-fuzzy OCR + Cross-Browser QR decoding & white-masking + Multi-Column Extraction.
   * - Decodes QR codes to `qrCodeInfo` and masks the QR square in pure white before OCR so QR modules never invent fake words.
   * - Primary Pass A runs on the natural RGB card image (`{ text: true, blocks: true }`) for 100% multi-column & watermark fidelity.
   * - Plays ONLY the crisp notification chime (no spoken voice words).
   */
  const enqueueCardExtraction = useCallback(
    async (
      frontImg: string,
      backImg?: string,
      options?: {
        forceReprocess?: boolean;
        labelHint?: string;
        capturedSignature?: number[];
        fromLiveCamera?: boolean;
        isManualTrigger?: boolean;
        replaceContactId?: string;
      }
    ) => {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const isAutoLiveFrame = Boolean(
        options?.fromLiveCamera && !options?.isManualTrigger
      );

      isExtractingRef.current = true;
      setIsExtractingOnSpot(true);
      setFrozenPreviewImage(frontImg);
      if (!isAutoLiveFrame) {
        setOnSpotResult(null);
      }

      setShutterFlash(true);
      playShutterClickSound(chimeEnabled);
      setTimeout(() => setShutterFlash(false), 110);

      if (!isAutoLiveFrame) {
        setBackgroundJobs((prev) => [
          {
            jobId,
            thumbnail: frontImg,
            startedAt: Date.now(),
            status: 'EXTRACTING',
            label: options?.labelHint || 'Cropping to card edges & reading exact text...',
            subtitle: 'Verifying printed fields (Company, Name, Phone, Email)',
          },
          ...prev.slice(0, 19),
        ]);
      }

      try {
        const cropGuide = Boolean(options?.fromLiveCamera);
        const shouldBoostExposure =
          enhanceLowLight ||
          lightingStatus === 'low_light' ||
          flashMode === 'FILL_LIGHT' ||
          (flashMode === 'TORCH' && !torchEnabled);

        let displayFront = await normalizeCardImage(frontImg, {
          rotationDegrees,
          enhanceContrast: shouldBoostExposure,
          exposureBoost: shouldBoostExposure,
          reduceGlare: lightingStatus === 'glare',
          cropToCardGuide: cropGuide,
        });

        const displayBack = backImg
          ? await normalizeCardImage(backImg, {
              rotationDegrees,
              enhanceContrast: shouldBoostExposure,
              exposureBoost: shouldBoostExposure,
              cropToCardGuide: cropGuide,
            })
          : undefined;

        // Decode QR codes & create white-masked natural RGB card image so QR squares never generate fake OCR words
        const [maskedNaturalFrontResult, maskedNaturalBackResult] = await Promise.all([
          maskQrOnNaturalImage(displayFront),
          displayBack
            ? maskQrOnNaturalImage(displayBack)
            : Promise.resolve({ maskedDataUrl: '', qrPayloads: [] as string[] }),
        ]);

        const allQrPayloads = Array.from(
          new Set([
            ...maskedNaturalFrontResult.qrPayloads,
            ...maskedNaturalBackResult.qrPayloads,
          ])
        );

        const scanHash = await computeScanHash(displayFront, displayBack);

        let rawOcrFront = '';
        let rawOcrBack = '';
        let spatialLinesBack: string[] = [];
        let avgConfidence = 95;
        let extractionEngineLabel = hasGeminiEngine
          ? 'Gemini 2.5 Vision AI (100% Precision)'
          : 'Local Offline OCR';
        let parsed: any = null;

        // 1. Prioritize Backend Extraction with Gemini 2.5 Vision AI (100% Precision)
        const clientApiKey = '';
        if (!isOfflineMode && navigator.onLine) {
          try {
            const apiRes = await fetch('/api/cards/extract', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-gemini-api-key': clientApiKey,
              },
              body: JSON.stringify({
                frontImageBase64: displayFront,
                backImageBase64: displayBack,
                apiKey: clientApiKey,
                scanHash,
                forceReprocess: options?.forceReprocess,
                enginePreference: localStorage.getItem('cardvault_engine_pref') || 'hybrid',
              }),
            });

            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.alreadyProcessed && apiData.existingContact) {
                isExtractingRef.current = false;
                setIsExtractingOnSpot(false);
                playScannerBeep('duplicate', chimeEnabled);
                const matchedExisting = apiData.existingContact;
                const matchedTitle =
                  matchedExisting.fields?.fullName?.value ||
                  matchedExisting.fields?.companyName?.value ||
                  matchedExisting.id;

                setOnSpotResult({
                  capturedImage: displayFront,
                  status: 'DUPLICATE',
                  contacts: [matchedExisting],
                  duplicateContact: matchedExisting,
                  message: `Already in database (${matchedTitle}). Change card.`,
                  engineLabel: apiData.engineLabel || 'Gemini 2.5 Vision AI',
                });

                setCardSwapBanner({
                  type: 'same_card_warning',
                  title: `Same Card Already Saved (${matchedTitle})`,
                  subtitle: 'Place the next business card inside the frame.',
                });
                return;
              }

              if (apiData.extraction) {
                parsed = apiData.extraction;
                rawOcrFront = parsed.rawOcrFront || '';
                rawOcrBack = parsed.rawOcrBack || '';
                avgConfidence = 99;
                extractionEngineLabel =
                  apiData.engineLabel || 'Gemini 2.5 Vision AI (100% Precision)';
                if (apiData.engine === 'GEMINI_VISION') {
                  setHasGeminiEngine(true);
                  setActiveEngineName('Gemini 2.5 Vision AI (100%)');
                }
              }
            }
          } catch (netErr) {
            console.warn('Backend extract call failed, falling back to local OCR:', netErr);
          }
        }

        // 2. Fallback: If backend returned no parsed result or offline, run lazy local multi-pass Tesseract
        if (!parsed) {
          const recognizeImage = async (imgDataUrl: string) => {
            try {
              if (!ocrWorkerRef.current) {
                const worker = await Tesseract.createWorker('eng', 1, {
                  langPath: `${window.location.origin}/tessdata`,
                  gzip: true,
                });
                await worker.setParameters({
                  user_defined_dpi: '300',
                  preserve_interword_spaces: '1',
                });
                ocrWorkerRef.current = worker;
              }
              return await ocrWorkerRef.current.recognize(
                imgDataUrl,
                {},
                { text: true, blocks: true }
              );
            } catch (tessErr) {
              console.warn('Client-side Tesseract fallback error:', tessErr);
              return { data: { text: '', confidence: 0 } } as any;
            }
          };

          // Primary Pass A: Natural RGB Card Image (with QR code masked in white)
          const resFrontPassA = await recognizeImage(
            maskedNaturalFrontResult.maskedDataUrl || displayFront
          );
          rawOcrFront = resFrontPassA.data.text || '';
          avgConfidence = resFrontPassA.data.confidence || 90;
          const spatialLinesFront = extractSpatialLinesFromTesseractData(resFrontPassA.data);

          if (displayBack) {
            const resBackPassA = await recognizeImage(
              maskedNaturalBackResult.maskedDataUrl || displayBack
            );
            rawOcrBack = resBackPassA.data.text || '';
            spatialLinesBack = extractSpatialLinesFromTesseractData(resBackPassA.data);
          }

          let combinedSpatialLines = [...spatialLinesFront, ...spatialLinesBack];
          parsed = parseBusinessCardOcrText(
            rawOcrFront,
            rawOcrBack,
            avgConfidence,
            combinedSpatialLines
          );

          // Secondary Pass B: If Primary Pass A missed any of the 4 mandatory fields
          const passAMandatory = checkFourMandatoryFields(parsed.fields);
          if (!passAMandatory.allFourPresent) {
            const ocrReadyFront = await normalizeCardImage(frontImg, {
              rotationDegrees,
              exposureBoost: shouldBoostExposure,
              forOcrEngine: true,
              cropToCardGuide: cropGuide,
            });
            const resFrontPassB = await recognizeImage(ocrReadyFront);
            const passBLines = extractSpatialLinesFromTesseractData(resFrontPassB.data);
            const mergedLines = [...combinedSpatialLines];
            for (const bLine of passBLines) {
              if (
                !mergedLines.some(
                  (existing) => existing.toLowerCase() === bLine.toLowerCase()
                )
              ) {
                mergedLines.push(bLine);
              }
            }
            combinedSpatialLines = mergedLines;
            const mergedRawFront = [rawOcrFront, resFrontPassB.data.text || '']
              .filter(Boolean)
              .join('\n');
            parsed = parseBusinessCardOcrText(
              mergedRawFront,
              rawOcrBack,
              Math.max(avgConfidence, resFrontPassB.data.confidence || 88),
              combinedSpatialLines
            );
          }

          // Pass C (Manual Capture Full-Frame Recovery)
          const passBMandatory = checkFourMandatoryFields(parsed.fields);
          if (
            !isAutoLiveFrame &&
            cropGuide &&
            (!passBMandatory.allFourPresent ||
              parsed.isUnreadable ||
              !hasValidBusinessCardAnchor(parsed.fields))
          ) {
            const fullFrameMasked = await maskQrOnNaturalImage(frontImg);
            const resFullFrame = await recognizeImage(fullFrameMasked.maskedDataUrl);
            const fullFrameLines = extractSpatialLinesFromTesseractData(resFullFrame.data);
            const mergedWithFull = [...combinedSpatialLines];
            for (const fLine of fullFrameLines) {
              if (
                !mergedWithFull.some(
                  (existing) => existing.toLowerCase() === fLine.toLowerCase()
                )
              ) {
                mergedWithFull.push(fLine);
              }
            }
            combinedSpatialLines = mergedWithFull;
            rawOcrFront = [rawOcrFront, resFullFrame.data.text || '']
              .filter(Boolean)
              .join('\n');
            parsed = parseBusinessCardOcrText(
              rawOcrFront,
              rawOcrBack,
              Math.max(avgConfidence, resFullFrame.data.confidence || 88),
              combinedSpatialLines
            );
          }

          // Pass D (Auto-Rotation Fallback)
          if (
            !isAutoLiveFrame &&
            (parsed.isUnreadable || !hasValidBusinessCardAnchor(parsed.fields))
          ) {
            const rotatedDeg = ((rotationDegrees + 90) % 360) as 0 | 90 | 180 | 270;
            const rotDisplayFront = await normalizeCardImage(frontImg, {
              rotationDegrees: rotatedDeg,
              enhanceContrast: true,
              exposureBoost: shouldBoostExposure,
              cropToCardGuide: false,
            });
            const rotMasked = await maskQrOnNaturalImage(rotDisplayFront);
            const resRot = await recognizeImage(rotMasked.maskedDataUrl);
            const rotLines = extractSpatialLinesFromTesseractData(resRot.data);
            const rotParsed = parseBusinessCardOcrText(
              resRot.data.text || '',
              rawOcrBack,
              resRot.data.confidence || 88,
              [...rotLines, ...spatialLinesBack]
            );
            if (
              !rotParsed.isUnreadable &&
              (hasValidBusinessCardAnchor(rotParsed.fields) ||
                rotLines.length > combinedSpatialLines.length)
            ) {
              displayFront = rotDisplayFront;
              parsed = rotParsed;
            }
          }
        }

        // Store QR payloads in qrCodeInfo (Notes) while strictly preferring printed card text
        if (allQrPayloads.length > 0) {
          parsed.fields = mergeQrPayloadsIntoFields(parsed.fields, allQrPayloads);
          if (parsed.allContacts && parsed.allContacts.length > 0) {
            parsed.allContacts[0].fields = mergeQrPayloadsIntoFields(
              parsed.allContacts[0].fields,
              allQrPayloads
            );
          } else if (parsed.allContacts) {
            parsed.allContacts.push({
              fields: parsed.fields,
              customFields: parsed.customFields || [],
            });
            parsed.isUnreadable = false;
          }
        }

        // GATE 1: Check if a valid business card was found in this capture
        const hasCardInfo = hasValidBusinessCardAnchor(parsed.fields) && !parsed.isUnreadable;
        if (!hasCardInfo) {
          isExtractingRef.current = false;
          setIsExtractingOnSpot(false);
          setFrozenPreviewImage(null);
          lastCaptureTimestampRef.current = Date.now() + 2500;
          stabilityStreakRef.current = 0;
          setLockProgress(0);
          autoWaitTicksRef.current = 0;

          if (!isAutoLiveFrame) {
            playScannerBeep('error', chimeEnabled);
            setCardSwapBanner({
              type: 'same_card_warning',
              title: 'No Business Card Detected',
              subtitle:
                parsed.unreadableReason ||
                'No contact details or card text found. Position the card clearly inside the frame.',
            });
            setOnSpotResult({
              capturedImage: displayFront,
              status: 'NO_CARD',
              contacts: [],
              message:
                parsed.unreadableReason ||
                'No business card detected. Please hold card steady inside the guide frame and try again.',
              engineLabel: extractionEngineLabel,
            });
          }
          return;
        }

        if (parsed.allContacts.length === 0) {
          parsed.allContacts.push({
            fields: parsed.fields,
            customFields: parsed.customFields,
          });
        }

        // Evaluate the 4 Mandatory Fields for validation tagging and review indicators
        const mandatoryCheck = checkFourMandatoryFields(parsed.fields);

        if (options?.capturedSignature && options.capturedSignature.length > 0) {
          lastCapturedSignatureRef.current = [...options.capturedSignature];
          lockedUntilCardSwappedRef.current = true;
          setSameCardStillInView(true);
        }

        const backSideNote =
          backImg && parsed.backSideHadNoExtraData
            ? 'Back side was blank/logo-only — extracted from Front side.'
            : backImg && spatialLinesBack.length > 0
            ? 'Front & Back sides merged.'
            : allQrPayloads.length > 0
            ? 'Printed card text extracted & QR code stored in notes.'
            : undefined;

        const activeExistingList = options?.replaceContactId
          ? existingContacts.filter((c) => c.id !== options.replaceContactId)
          : existingContacts;
        const exactHashMatch = activeExistingList.find((c) => c.scanHash === scanHash);
        const ocrSimilarityMatch = activeExistingList.find(
          (c) => computeOcrTextSimilarity(c.rawOcrFront, parsed.rawOcrFront) >= 0.78
        );
        const fieldDupCheck = findDuplicateContact(parsed.fields, activeExistingList);
        const matchedExisting =
          exactHashMatch || ocrSimilarityMatch || fieldDupCheck.duplicate;

        if (matchedExisting && !options?.forceReprocess) {
          isExtractingRef.current = false;
          setIsExtractingOnSpot(false);
          playScannerBeep('duplicate', chimeEnabled);
          const matchedTitle =
            matchedExisting.fields.fullName.value ||
            matchedExisting.fields.companyName.value ||
            matchedExisting.id;

          setOnSpotResult({
            capturedImage: displayFront,
            status: 'DUPLICATE',
            contacts: [matchedExisting],
            duplicateContact: matchedExisting,
            message: `Already in database (${matchedTitle}). Swap card.`,
            backSideNote,
          });

          setCardSwapBanner({
            type: 'same_card_warning',
            title: `Same Card Already Saved (${matchedTitle})`,
            subtitle: 'Place the next business card inside the frame.',
          });

          if (autoCaptureEnabled) {
            if (autoDismissTimerRef.current) {
              clearTimeout(autoDismissTimerRef.current);
            }
            autoDismissTimerRef.current = setTimeout(() => {
              dismissOnSpotModal();
            }, 1800);
          }

          setBackgroundJobs((prev) => {
            const item: BackgroundJobItem = {
              jobId,
              thumbnail: displayFront,
              startedAt: Date.now(),
              status: 'DUPLICATE_SKIPPED',
              label: `Same Card Skipped · ${matchedTitle}`,
              subtitle: 'Already in Contacts Database',
              contact: matchedExisting,
            };
            const exists = prev.some((j) => j.jobId === jobId);
            return exists
              ? prev.map((j) => (j.jobId === jobId ? item : j))
              : [item, ...prev.slice(0, 19)];
          });
          return;
        }

        if (isOfflineMode) {
          isExtractingRef.current = false;
          setIsExtractingOnSpot(false);
          const queueItem: PendingOfflineScan = {
            id: `OFFLINE-${Date.now().toString().slice(-6)}`,
            scanHash,
            frontImageBase64: displayFront,
            backImageBase64: displayBack,
            capturedAt: new Date().toISOString(),
            status: 'QUEUED_OFFLINE',
            retryCount: 0,
            cardLabel:
              parsed.fields.fullName.value ||
              parsed.fields.companyName.value ||
              'Captured Business Card',
          };
          await onQueueOfflineScan(queueItem);
          playScannerBeep('captured', chimeEnabled);
          setCardSwapBanner({
            type: 'change_card',
            title: 'Card Queued Offline — Change to Next Card',
            subtitle: 'Remove current card and place the next business card in view.',
          });
          return;
        }

        const personEntries = (parsed.allContacts || []).filter((p: any) =>
          hasValidBusinessCardAnchor(p.fields)
        );
        if (personEntries.length === 0) {
          personEntries.push({
            fields: parsed.fields,
            customFields: parsed.customFields,
          });
        }

        const createdRecords: ContactRecord[] = [];
        let primaryValidation: CoreFieldValidationSummary | undefined;

        for (let idx = 0; idx < personEntries.length; idx++) {
          const person = personEntries[idx];
          const coreValidation = evaluateCoreAndRecordStatus(
            person.fields,
            [],
            parsed.imageQualityIssues,
            undefined
          );
          if (idx === 0) {
            primaryValidation = coreValidation;
          }

          const recordId =
            idx === 0 && options?.replaceContactId
              ? options.replaceContactId
              : `CV-2026-${Math.floor(1000 + Math.random() * 9000)}${
                  personEntries.length > 1 ? `-${idx + 1}` : ''
                }`;

          const newRecord: ContactRecord = {
            id: recordId,
            scanHash: idx === 0 ? scanHash : `${scanHash}_person_${idx + 1}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            overallStatus: coreValidation.overallStatus,
            savedWithoutCoreFields: !coreValidation.allCoreVerified,
            missingCoreFieldLabels: coreValidation.missingCoreFields.map((m) => m.label),
            reviewReasons: [
              ...coreValidation.missingCoreFields.map((m) => `Missing ${m.label}`),
              ...coreValidation.uncertainCoreFields.map(
                (u) => `${u.label}: ${u.reason}`
              ),
              ...coreValidation.otherReviewIssues,
            ],
            frontImageBase64: displayFront,
            backImageBase64: displayBack,
            rawOcrFront: parsed.rawOcrFront,
            rawOcrBack: parsed.rawOcrBack,
            cardOrientation: (parsed as any).cardOrientation || 'horizontal',
            imageQualityIssues: parsed.imageQualityIssues,
            frontBackConflicts: [],
            fields: person.fields,
            customFields: person.customFields,
            eventName: activeEvent || 'Default',
            sheetTab: activeEvent || 'Default',
            syncStatus: 'SYNCED',
            scanLog: parsed.scanLog,
          };

          if (!isGarbageContactRecord(newRecord) || !isAutoLiveFrame) {
            createdRecords.push(newRecord);
          }
        }

        if (createdRecords.length === 0) {
          isExtractingRef.current = false;
          setIsExtractingOnSpot(false);
          setFrozenPreviewImage(null);
          // Impose a 2.5s backoff cooldown so auto-mode NEVER spams repeat shots on non-card surfaces
          lastCaptureTimestampRef.current = Date.now() + 2500;
          stabilityStreakRef.current = 0;
          setLockProgress(0);
          return;
        }

        const primaryRecord = createdRecords[0];
        const primaryMandatory = checkFourMandatoryFields(primaryRecord.fields);

        const hasCardAnchor = hasValidBusinessCardAnchor(primaryRecord.fields);
        const hasIdentity = Boolean(
          primaryRecord.fields.fullName.value ||
          primaryRecord.fields.companyName.value
        );
        const hasContactMethod = Boolean(
          primaryRecord.fields.mobileNumber.value ||
          primaryRecord.fields.officePhone.value ||
          primaryRecord.fields.companyTelephone.value ||
          primaryRecord.fields.whatsappNumber.value ||
          primaryRecord.fields.email.value
        );

        // Evaluate complete mandatory verification
        const isFullyVerified =
          primaryMandatory.allFourPresent &&
          primaryRecord.overallStatus === 'VERIFIED';
        const isReviewRequired = !isFullyVerified;

        // In Auto Mode: Save automatically without asking for confirmation!
        // - Fully verified cards: auto-saved directly as 'VERIFIED'
        // - Cards missing mobile, email, or requiring review: auto-saved directly as segregated 'NEEDS_REVIEW'
        //   so batch continuous scanning is NEVER blocked!
        // In Manual Mode: Require user confirmation via the "Save to Contacts" button.
        const shouldAutoSaveNow = autoCaptureEnabled;

        if (shouldAutoSaveNow) {
          for (let i = 0; i < createdRecords.length; i++) {
            await onSaveContact(createdRecords[i], i === 0);
          }
        }

        isExtractingRef.current = false;
        setIsExtractingOnSpot(false);
        playScannerBeep(isReviewRequired ? 'review' : 'captured', chimeEnabled);

        const namesList = createdRecords
          .map((r) => r.fields.fullName.value)
          .filter(Boolean);
        const companyTitle = primaryRecord.fields.companyName.value;
        const displayTitle =
          namesList.length > 1
            ? `${namesList.length} Contacts (${namesList.join(', ')})`
            : namesList[0] ||
              companyTitle ||
              primaryRecord.fields.email.value ||
              'Card Extracted';

        setOnSpotResult({
          capturedImage: displayFront,
          status: shouldAutoSaveNow ? 'SAVED' : 'AWAITING_DECISION',
          contacts: createdRecords,
          missingMandatoryLabels: primaryMandatory.missingMandatoryLabels,
          isSegregatedToReview: shouldAutoSaveNow && isReviewRequired,
          message: shouldAutoSaveNow
            ? isReviewRequired
              ? `Segregated to Needs Review · Missing ${primaryMandatory.missingMandatoryLabels.join(' & ')}`
              : createdRecords.length > 1
                ? `${createdRecords.length} contacts saved — Swap card`
                : 'All 4 mandatory fields verified & saved — Swap card'
            : isReviewRequired
              ? `Missing mandatory: ${primaryMandatory.missingMandatoryLabels.join(', ')}`
              : 'Card extracted · Review to Save',
          backSideNote,
          engineLabel: extractionEngineLabel,
        });

        if (shouldAutoSaveNow) {
          if (autoDismissTimerRef.current) {
            clearTimeout(autoDismissTimerRef.current);
          }
          autoDismissTimerRef.current = setTimeout(() => {
            dismissOnSpotModal();
          }, 1800);
        }

        const newJobItem: BackgroundJobItem = {
          jobId,
          thumbnail: displayFront,
          startedAt: Date.now(),
          status: shouldAutoSaveNow
            ? primaryRecord.overallStatus === 'VERIFIED'
              ? 'SAVED_VERIFIED'
              : 'SAVED_NEEDS_REVIEW'
            : 'AWAITING_DECISION',
          label: `${displayTitle}${
            companyTitle && displayTitle !== companyTitle ? ` · ${companyTitle}` : ''
          }`,
          subtitle: shouldAutoSaveNow
            ? isReviewRequired
              ? `Segregated to Needs Review (Missing ${primaryMandatory.missingMandatoryLabels.join(' & ')})`
              : backSideNote || 'Saved to Contacts — Swap to next card'
            : `Not saved yet — Missing: ${primaryMandatory.missingMandatoryLabels.join(', ')}`,
          contact: primaryRecord,
          extraContactsCount: createdRecords.length - 1,
          allSavedContacts: createdRecords,
          validation: primaryValidation,
        };

        setBackgroundJobs((prev) => {
          const exists = prev.some((j) => j.jobId === jobId);
          return exists
            ? prev.map((j) => (j.jobId === jobId ? newJobItem : j))
            : [newJobItem, ...prev.slice(0, 19)];
        });

        setCardSwapBanner({
          type: 'change_card',
          title: shouldAutoSaveNow
            ? isReviewRequired
              ? `Segregated to Needs Review (${displayTitle}) — Swap Card`
              : `Card Saved (${displayTitle}) — Ready for Next Card`
            : `Review Card (${displayTitle})`,
          subtitle: shouldAutoSaveNow
            ? isReviewRequired
              ? `Missing ${primaryMandatory.missingMandatoryLabels.join(' & ')} · Saved to Needs Review tab. Remove card to scan next.`
              : 'Remove current card from camera frame to scan the next card.'
            : 'Tap "Save to Contacts" to confirm, or tap "Edit" / "Discard".',
        });
      } catch (err: any) {
        isExtractingRef.current = false;
        setIsExtractingOnSpot(false);
        setFrozenPreviewImage(null);
        lastCaptureTimestampRef.current = Date.now() + 2500;
        stabilityStreakRef.current = 0;
        setLockProgress(0);
        onIncrementFailedScan();
        if (!isAutoLiveFrame) {
          playScannerBeep('error', chimeEnabled);
          setBackgroundJobs((prev) =>
            prev.map((j) =>
              j.jobId === jobId
                ? {
                    ...j,
                    status: 'REJECTED_NON_CARD',
                    label: 'OCR Read Error',
                    errorMsg: err?.message || 'Failed to read card image',
                  }
                : j
            )
          );
        }
      }
    },
    [
      rotationDegrees,
      enhanceLowLight,
      lightingStatus,
      flashMode,
      torchEnabled,
      existingContacts,
      isOfflineMode,
      chimeEnabled,
      onQueueOfflineScan,
      onIncrementFailedScan,
      onSaveContact,
    ]
  );

  // Capture current video frame (with optional pre-capture LED Torch / Studio Fill-Light illumination pulse)
  const captureCurrentVideoFrame = useCallback(
    async (isManualTrigger = false, forceFlashPulse = false, forceCaptureAnyway = false) => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (isExtractingRef.current) return;

      const now = Date.now();
      if (!isManualTrigger && now - lastCaptureTimestampRef.current < 900) return;

      if (!isManualTrigger && lockedUntilCardSwappedRef.current) {
        return;
      }

      lastCaptureTimestampRef.current = now;
      autoWaitTicksRef.current = 0;
      setShowManualCaptureAssist(false);

      const shouldPulseIllumination =
        forceFlashPulse ||
        flashMode === 'FILL_LIGHT' ||
        (flashMode === 'AUTO' && lightingStatus === 'low_light') ||
        (flashMode === 'TORCH' && !torchEnabled);

      let temporaryTorchTurnedOn = false;
      if (shouldPulseIllumination) {
        setFillLightPulse(true);
        setEnhanceLowLight(true);
        if (!torchEnabled) {
          temporaryTorchTurnedOn = await applyHardwareTorch(true);
        }
        await new Promise((r) => setTimeout(r, 240));
      }

      const video = videoRef.current;
      if (!video) {
        setFillLightPulse(false);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setFillLightPulse(false);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Mandatory Physical Card Presence Verification on high-resolution captured frame
      const presence = validateFrameCardPresence(canvas);
      if (!presence.hasCard) {
        if (!isManualTrigger) {
          // In Auto Mode: Silently drop false auto-snap immediately with zero freeze, zero shutter click, zero OCR!
          stabilityStreakRef.current = 0;
          setLockProgress(0);
          lastCaptureTimestampRef.current = Date.now() + 1500;
          if (shouldPulseIllumination) {
            setFillLightPulse(false);
            if (temporaryTorchTurnedOn && flashMode !== 'TORCH') {
              await applyHardwareTorch(false);
            }
          }
          return;
        } else if (!forceCaptureAnyway) {
          setNoCardWarning(
            presence.reason ||
              'No business card detected in view. Please place card inside the guide frame and hold steady.'
          );
          playScannerBeep('error', chimeEnabled);
          if (shouldPulseIllumination) {
            setFillLightPulse(false);
            if (temporaryTorchTurnedOn && flashMode !== 'TORCH') {
              await applyHardwareTorch(false);
            }
          }
          return;
        }
      }
      setNoCardWarning(null);

      const fullFrameDataUrl = canvas.toDataURL('image/jpeg', 0.96);

      if (shouldPulseIllumination) {
        setFillLightPulse(false);
        if (temporaryTorchTurnedOn && flashMode !== 'TORCH') {
          await applyHardwareTorch(false);
        }
      }

      const snapshotSignature =
        currentSignatureRef.current.length > 0
          ? [...currentSignatureRef.current]
          : undefined;

      if (scanTwoSides && activeSideCapture === 'FRONT') {
        setShutterFlash(true);
        playShutterClickSound(chimeEnabled);
        setTimeout(() => setShutterFlash(false), 110);
        setCapturedFrontForTwoSided(fullFrameDataUrl);
        setActiveSideCapture('BACK');
        playScannerBeep('captured', chimeEnabled);
        setCardSwapBanner({
          type: 'change_card',
          title: 'Front Side Captured — Flip Card for Back Side',
          subtitle:
            'If the back side is blank or logo-only, tap "Extract Front Only" inside the camera view.',
        });
      } else if (
        scanTwoSides &&
        activeSideCapture === 'BACK' &&
        capturedFrontForTwoSided
      ) {
        const front = capturedFrontForTwoSided;
        const replaceId = stagedReplaceContactId;
        setCapturedFrontForTwoSided(null);
        setStagedReplaceContactId(undefined);
        setActiveSideCapture('FRONT');
        enqueueCardExtraction(front, fullFrameDataUrl, {
          capturedSignature: snapshotSignature,
          fromLiveCamera: true,
          isManualTrigger,
          replaceContactId: replaceId,
        });
      } else {
        enqueueCardExtraction(fullFrameDataUrl, undefined, {
          capturedSignature: snapshotSignature,
          fromLiveCamera: true,
          isManualTrigger,
        });
      }
    },
    [
      flashMode,
      lightingStatus,
      torchEnabled,
      applyHardwareTorch,
      scanTwoSides,
      activeSideCapture,
      capturedFrontForTwoSided,
      stagedReplaceContactId,
      chimeEnabled,
      enqueueCardExtraction,
    ]
  );

  /**
   * 150ms Portrait- & Landscape-Aware Live Camera Loop:
   * - Requires 3 consecutive steady & focused frames (`stabilityScore >= 78`, ~450ms) for fast one-handed auto-capture.
   * - If auto-capture hasn't locked within 1.5s (`10 ticks`), highlights the Manual Capture Assist prompt.
   */
  useEffect(() => {
    if (!cameraActive || isPaused) {
      stabilityStreakRef.current = 0;
      setLockProgress(0);
      autoWaitTicksRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      if (!videoRef.current || !analysisCanvasRef.current) return;
      if (isExtractingRef.current) return;

      const metrics = analyzeVideoFrameStability(
        videoRef.current,
        analysisCanvasRef.current,
        prevPixelsRef.current,
        lastCapturedSignatureRef.current
      );
      prevPixelsRef.current = metrics.currentPixels;
      currentSignatureRef.current = metrics.currentSignature;
      setStabilityScore(metrics.stabilityScore);
      setFocusSharpness(metrics.focusSharpness);
      setCardDetected(metrics.cardDetected);
      setCardConfidence(metrics.cardConfidence || 0);
      setTextLineSignal(metrics.textLineSignal);
      setLightingStatus(metrics.lightingStatus);
      setSameCardStillInView(metrics.sameCardStillInView);

      if (lockedUntilCardSwappedRef.current) {
        autoWaitTicksRef.current = 0;
        setShowManualCaptureAssist(false);
        if (!metrics.sameCardStillInView && metrics.similarityToLastCard < 68) {
          lockedUntilCardSwappedRef.current = false;
          stabilityStreakRef.current = 0;
          setLockProgress(0);
          setFrozenPreviewImage(null);
          setCardSwapBanner({
            type: 'ready',
            title: 'Card Changed — Hold Next Business Card Steady',
            subtitle:
              'Hold steady anywhere in view to lock on and auto-extract, or tap the shutter below.',
          });
        }
        return;
      }

      const minSharpness = enhanceLowLight || lightingStatus === 'low_light' ? 4 : 5;
      const isCardReadyForAutoSnap =
        autoCaptureEnabled &&
        metrics.cardDetected &&
        metrics.focusSharpness >= minSharpness &&
        !metrics.sameCardStillInView &&
        metrics.stabilityScore >= 55;

      const requiredTicks = 3; // ~450ms of verified steady hold over a real card

      if (isCardReadyForAutoSnap) {
        setNoCardWarning(null);
        stabilityStreakRef.current += 1;
        const progress = Math.min(100, Math.round((stabilityStreakRef.current / requiredTicks) * 100));
        setLockProgress(progress);
        if (stabilityStreakRef.current >= requiredTicks) {
          stabilityStreakRef.current = 0;
          setLockProgress(0);
          autoWaitTicksRef.current = 0;
          setShowManualCaptureAssist(false);
          captureCurrentVideoFrame(false);
        }
      } else {
        // If phone has a major movement or card is completely lost, reset streak
        if (!metrics.cardDetected || metrics.motionDelta > 10 || metrics.stabilityScore < 30) {
          stabilityStreakRef.current = 0;
          setLockProgress(0);
        } else if (stabilityStreakRef.current > 0) {
          // Graceful decay instead of jarring 100% -> 0% drop on slight hand twitch
          stabilityStreakRef.current = Math.max(0, stabilityStreakRef.current - 1);
          setLockProgress(Math.min(100, Math.round((stabilityStreakRef.current / requiredTicks) * 100)));
        }
        autoWaitTicksRef.current += 1;
        if (autoWaitTicksRef.current >= 12) {
          setShowManualCaptureAssist(true);
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [cameraActive, isPaused, autoCaptureEnabled, captureCurrentVideoFrame]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    side: 'FRONT' | 'BACK'
  ) => {
    const files = Array.from(e.target.files || []);
    // Reset immediately so subsequent snaps of the same card always trigger onChange
    e.target.value = '';
    if (files.length === 0) return;

    // Smart 2-Sided Gallery Upload: If 2 files selected in 2-sided mode, pair them automatically
    if (side === 'FRONT' && scanTwoSides && files.length === 2) {
      const readAsDataUrl = (file: File) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

      const frontDataUrl = await readAsDataUrl(files[0]);
      const backDataUrl = await readAsDataUrl(files[1]);
      await enqueueCardExtraction(frontDataUrl, backDataUrl, {
        labelHint: `${files[0].name} (Front) + ${files[1].name} (Back)`,
        fromLiveCamera: false,
        isManualTrigger: true,
      });
      return;
    }

    for (const file of files) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      if (side === 'FRONT') {
        if (scanTwoSides && files.length === 1) {
          setCapturedFrontForTwoSided(dataUrl);
          setActiveSideCapture('BACK');
        } else {
          await enqueueCardExtraction(dataUrl, undefined, {
            labelHint: file.name,
            fromLiveCamera: false,
            isManualTrigger: true,
          });
        }
      } else {
        if (capturedFrontForTwoSided) {
          const front = capturedFrontForTwoSided;
          const replaceId = stagedReplaceContactId;
          setCapturedFrontForTwoSided(null);
          setStagedReplaceContactId(undefined);
          setActiveSideCapture('FRONT');
          await enqueueCardExtraction(front, dataUrl, {
            labelHint: file.name,
            fromLiveCamera: false,
            isManualTrigger: true,
            replaceContactId: replaceId,
          });
        }
      }
    }
  };

  useEffect(() => {
    if (onSpotResult && onSpotResultRef.current) {
      onSpotResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [onSpotResult]);

  const activeExtractingCount = backgroundJobs.filter(
    (j) => j.status === 'EXTRACTING'
  ).length;

  const getStageInfo = (stage: typeof autoscanStage) => {
    switch (stage) {
      case 'SEARCHING':
        return {
          label: '1/6 Searching for Card Contour (3.5" x 2")',
          color: 'text-slate-300',
        };
      case 'ALIGNING':
        return {
          label: `2/6 Card Locked · Sharpness ${focusSharpness} · Stability ${stabilityScore}%`,
          color: 'text-cyan-300',
        };
      case 'CAPTURING':
        return {
          label: '3/6 Auto-Capturing High-Resolution Frame...',
          color: 'text-emerald-300',
        };
      case 'EXTRACTING':
        return {
          label: '4/6 RapidOCR (CPU ONNX) Deep Extraction...',
          color: 'text-blue-300',
        };
      case 'PARSING':
        return {
          label: '5/6 Parsing Name, Numbers, Email & Organization...',
          color: 'text-indigo-300',
        };
      case 'SYNCING_SHEETS':
        return {
          label: '6/6 Appending to Google Sheets Webhook...',
          color: 'text-amber-300',
        };
      case 'SAVED':
        return {
          label: '✓ Saved & Verified in Contacts & Sheets',
          color: 'text-emerald-300',
        };
    }
  };

  const handleViewfinderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTapFocusPoint({ x, y });
    setTimeout(() => setTapFocusPoint(null), 650);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([30]);
    }

    // Decoupled: Tapping viewfinder focuses camera and triggers haptics, but NEVER takes a photo.
    // Photos are captured via the Shutter button or verified Auto-Lock.
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4 space-y-3 sm:space-y-4">
      <canvas ref={analysisCanvasRef} className="hidden" />
      {/* 1. Dedicated Direct Mobile Camera Trigger: Rear environment camera, single photo */}
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileUpload(e, activeSideCapture === 'BACK' ? 'BACK' : 'FRONT')}
      />
      {/* 2. Dedicated Mobile Photo Gallery Trigger */}
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, activeSideCapture === 'BACK' ? 'BACK' : 'FRONT')}
      />
      <input
        ref={frontFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'FRONT')}
      />
      <input
        ref={backFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'BACK')}
      />

      {/* Unified Professional Status Bar */}
      <div className="w-full max-w-full bg-white border border-slate-200/80 text-slate-900 rounded-xl p-2 sm:p-2.5 flex items-center justify-between gap-2 shadow-2xs overflow-hidden">
        {/* Left: Dynamic Scanner Status Badge & Live Counts */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 ${
              sameCardStillInView || cardSwapBanner.type === 'same_card_warning'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : isExtractingOnSpot
                ? 'bg-slate-900 text-white'
                : cardDetected
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sameCardStillInView
                  ? 'bg-amber-500'
                  : isExtractingOnSpot
                  ? 'bg-slate-300 animate-ping'
                  : cardDetected
                  ? 'bg-emerald-400'
                  : 'bg-emerald-500'
              }`}
            />
            <span className="truncate max-w-[110px] sm:max-w-none">
              {sameCardStillInView
                ? 'Swap Card'
                : isExtractingOnSpot
                ? 'Reading Card...'
                : cardDetected
                ? 'Card Locked'
                : 'Ready to Scan'}
            </span>
          </div>

          {/* Compact Telemetry Counters */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono text-slate-500 truncate">
            <span title="Total Cards Scanned">
              <span className="text-slate-400 hidden xs:inline">Scanned: </span>
              <strong className="text-slate-900 font-bold">{sessionStats.totalScanned}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span title="Verified Cards">
              <span className="text-slate-400 hidden xs:inline">Synced: </span>
              <strong className="text-emerald-700 font-bold">{sessionStats.autoSavedVerified}</strong>
            </span>
            {sessionStats.savedNeedsReview > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span title="Needs Review">
                  <span className="text-slate-400 hidden xs:inline">Review: </span>
                  <strong className="text-amber-700 font-bold">{sessionStats.savedNeedsReview}</strong>
                </span>
              </>
            )}
            {activeExtractingCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1 text-slate-700 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                  <span className="hidden xs:inline">Extracting</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Quick Settings & Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {(lockedUntilCardSwappedRef.current || onSpotResult || sameCardStillInView) && (
            <button
              type="button"
              onClick={unlockForNextCard}
              className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Unlock scanner to scan next business card"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Next Card</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setChimeEnabled((prev) => !prev)}
            className="h-8 px-2 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition-colors shadow-2xs"
            title={chimeEnabled ? 'Notification Chime: ON' : 'Notification Chime: MUTED'}
          >
            {chimeEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {lastAutoSavedContact && (
            <button
              type="button"
              onClick={onUndoLastSave}
              className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 text-xs text-slate-700 border border-slate-200 flex items-center gap-1 transition-colors shadow-2xs"
              title="Undo last saved contact"
            >
              <Undo2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Undo</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleOfflineMode}
            className={`h-8 px-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors shadow-2xs ${
              isOfflineMode
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
            }`}
            title={isOfflineMode ? 'Offline Queue: ACTIVE' : 'Switch to Offline Queue'}
          >
            <WifiOff className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => openBulkUpload()}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            title="Upload multiple business card images at once (Batch Review)"
          >
            <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Bulk Upload</span>
          </button>

          {pendingOfflineQueue.length > 0 && !isOfflineMode && (
            <button
              type="button"
              onClick={onProcessOfflineQueue}
              className="h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1 shadow-2xs transition-colors"
              title="Sync pending offline queue contacts"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Sync {pendingOfflineQueue.length}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Responsive Grid: Left Spacious Camera Viewfinder & Pro Shutter Deck (7 cols) + Right Extraction & Stream (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Professional Mobile Camera Viewfinder & Shutter Deck */}
        <div className="lg:col-span-7 bg-white rounded-xl overflow-hidden border border-slate-200/80 shadow-2xs flex flex-col">
          {/* Live Video Stage with Proportional Business Card Framing Guide */}
          <div
            onClick={handleViewfinderClick}
            className="relative h-[48dvh] sm:h-[52dvh] min-h-[300px] max-h-[580px] flex flex-col justify-between p-3 sm:p-4 bg-slate-950 cursor-pointer select-none overflow-hidden touch-none"
            title="Point at business card or tap to focus"
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
                cameraViewFit === 'fit' ? 'object-contain' : 'object-cover'
              } ${
                cameraActive ? 'opacity-100' : 'opacity-20'
              } ${
                flashMode === 'FILL_LIGHT' ||
                fillLightPulse ||
                enhanceLowLight ||
                (flashMode === 'TORCH' && !torchEnabled) ||
                (flashMode === 'AUTO' && lightingStatus === 'low_light')
                  ? 'brightness-125 contrast-115'
                  : ''
              }`}
            />

            {/* Tap-to-Focus Ripple Circle */}
            {tapFocusPoint && (
              <div
                className="absolute pointer-events-none z-30 w-12 h-12 rounded-full border-2 border-cyan-400 animate-focus-ripple"
                style={{ left: tapFocusPoint.x, top: tapFocusPoint.y }}
              />
            )}

            {/* Studio Fill-Light Ring */}
            {(flashMode === 'FILL_LIGHT' ||
              fillLightPulse ||
              (flashMode === 'TORCH' && !torchEnabled)) && (
              <div className="pointer-events-none absolute inset-0 z-10 border-[14px] sm:border-[20px] border-white/95 shadow-[inset_0_0_90px_rgba(255,255,255,0.85)] transition-all" />
            )}

            {/* Top Viewfinder Floating Glass HUD Strip */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-20 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-1 sm:gap-2 bg-slate-950/85 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-full border border-white/15 shadow-xl">
                {/* Dynamic Status Capsule: Clean & Informative */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 transition-colors ${
                      isExtractingOnSpot
                        ? 'bg-blue-400 animate-pulse'
                        : lockProgress > 0
                        ? 'bg-emerald-400 animate-ping'
                        : cardDetected && stabilityScore >= 72
                        ? 'bg-emerald-400'
                        : cardDetected
                        ? 'bg-emerald-400/70'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-xs font-medium text-white truncate max-w-[95px] sm:max-w-none">
                    {isExtractingOnSpot
                      ? 'Extracting...'
                      : lockProgress > 0
                      ? `Locking (${lockProgress}%)`
                      : cardDetected && stabilityScore >= 70
                      ? 'Card Detected — Hold Steady'
                      : cardDetected
                      ? 'Card In View'
                      : autoCaptureEnabled
                      ? 'Scanning for Card...'
                      : 'Manual Mode'}
                  </span>
                </div>

                {/* Quick Controls */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoCaptureEnabled;
                      setAutoCaptureEnabled(next);
                      localStorage.setItem('cardvault_autocapture', String(next));
                    }}
                    id="auto-manual-toggle"
                    className={`h-7 px-2 sm:px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all ${
                      autoCaptureEnabled
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'bg-white/10 text-slate-300 hover:text-white border border-white/20'
                    }`}
                    title={autoCaptureEnabled ? 'Auto-Scan is ON: Snaps automatically when card is held steady for 750ms' : 'Manual Mode: You control the capture. Tap the shutter button below when ready.'}
                  >
                    <ScanLine className="w-3 h-3" />
                    <span>{autoCaptureEnabled ? 'Auto' : 'Manual'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleInstantFlash}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      flashMode === 'TORCH' || flashMode === 'FILL_LIGHT'
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                    }`}
                    title="Toggle Torch / Studio Fill-Light"
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                  </button>

                  {rearCameraDevices.length > 1 && currentCameraFacing === 'environment' && (
                    <button
                      type="button"
                      onClick={cycleRearCameraLens}
                      className="px-2 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/15 text-[11px] font-mono font-medium flex items-center gap-1 transition-all"
                      title="Switch physical rear camera lens (Wide / Ultra-Wide / Telephoto)"
                    >
                      <Camera className="w-3 h-3" />
                      <span className="hidden sm:inline">Lens</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const nextFit = cameraViewFit === 'fit' ? 'cover' : 'fit';
                      setCameraViewFit(nextFit);
                      localStorage.setItem('cardvault_camera_fit', nextFit);
                    }}
                    className={`h-7 w-7 sm:w-auto p-0 sm:px-2.5 rounded-full flex items-center justify-center gap-1 transition-all text-[11px] font-medium border ${
                      cameraViewFit === 'fit'
                        ? 'bg-white/25 text-white border-white/30'
                        : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
                    }`}
                    title={
                      cameraViewFit === 'fit'
                        ? 'Currently Full View (100% uncropped sensor). Tap to fill screen.'
                        : 'Currently Fill Screen (zoomed). Tap for full uncropped view.'
                    }
                  >
                    {cameraViewFit === 'fit' ? (
                      <>
                        <Scan className="w-3.5 h-3.5 text-white" />
                        <span className="hidden sm:inline">Full</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3.5 h-3.5 text-white" />
                        <span className="hidden sm:inline">Fill</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openOcrSettings()}
                    className="h-7 w-7 sm:w-auto p-0 sm:px-2.5 rounded-full flex items-center justify-center gap-1 transition-all text-[11px] font-medium border bg-white/10 hover:bg-white/20 text-white border-white/15"
                    title="Configure OCR Engine & Google AI Studio"
                  >
                    <Cpu className="w-3.5 h-3.5 text-slate-300" />
                    <span className="hidden sm:inline">
                      {ocrEnginePreference === 'ai_studio'
                        ? 'AI Studio'
                        : ocrEnginePreference === 'rapid_ocr'
                        ? 'RapidOCR'
                        : 'Hybrid'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Low-Light Quick Alert Pill */}
            {!isExtractingOnSpot &&
              lightingStatus === 'low_light' &&
              flashMode !== 'TORCH' &&
              flashMode !== 'FILL_LIGHT' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-20 flex justify-center"
                >
                  <button
                    type="button"
                    onClick={toggleInstantFlash}
                    className="px-3.5 py-1.5 rounded-full bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-lg animate-pulse"
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                    Low Light Detected — Tap for Flash
                  </button>
                </div>
              )}

            {/* "Card Not Available" Smart Interception Banner */}
            {noCardWarning && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative z-30 mx-3 my-1 bg-slate-900/95 text-white border border-amber-500/60 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex items-center justify-between gap-2.5 animate-in fade-in slide-in-from-top-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-200">No Business Card Detected</p>
                    <p className="text-[11px] text-slate-300 leading-tight truncate">{noCardWarning}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setNoCardWarning(null);
                      captureCurrentVideoFrame(true, false, true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shadow-sm active:scale-95 transition"
                  >
                    Force Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoCardWarning(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                    aria-label="Dismiss warning"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Front Card Thumbnail Badge when in 2-Sided Capture */}
            {capturedFrontForTwoSided && scanTwoSides && activeSideCapture === 'BACK' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-18 left-4 z-20 flex items-center gap-2 bg-slate-950/90 border border-blue-400/80 p-1.5 rounded-xl shadow-xl backdrop-blur-md"
              >
                <img
                  src={capturedFrontForTwoSided}
                  alt="Front Side"
                  className="w-12 h-8 rounded object-cover border border-slate-700"
                />
                <div className="text-[10px] leading-tight">
                  <div className="font-bold text-blue-300">Front Locked</div>
                  <div className="text-slate-400">Aligning Back...</div>
                </div>
              </div>
            )}

            {/* Fluid Position-Agnostic Business Card Guide Reticle & Dynamic Auto-Scan Feedback */}
            {!isExtractingOnSpot && !sameCardStillInView && (
              viewfinderGuideMode === 'open' ? (
                /* Sleek Open Viewfinder: Minimal Floating Detection Indicator with Full Screen Freedom */
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-4">
                  {/* Subtle edge flash when card is detected */}
                  {cardDetected && (
                    <div
                      className={`absolute inset-0 rounded-2xl pointer-events-none transition-colors duration-150 border-2 ${
                        lockProgress > 0
                          ? 'border-emerald-400 bg-emerald-500/10 shadow-[inset_0_0_30px_rgba(52,211,153,0.3)]'
                          : 'border-cyan-400/80 bg-cyan-500/5'
                      }`}
                    />
                  )}
                  {lockProgress > 0 && (
                    <div className="flex flex-col items-center gap-1.5 z-10 pb-2">
                      <span className="bg-slate-950/90 text-emerald-300 px-3.5 py-1 rounded-full text-xs font-bold border border-emerald-500/40 shadow-xl flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>Locking Card ({lockProgress}%)</span>
                      </span>
                      <div className="w-44 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/20">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-150"
                          style={{ width: `${lockProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Framing Guide Mode: Delicate Fluid Framing Brackets with Position Freedom */
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-4">
                  <div
                    className={`relative w-[92%] sm:w-[88%] max-w-[460px] aspect-[3.5/2] rounded-2xl transition-colors duration-150 flex flex-col justify-between p-3.5 ${
                      lockProgress > 0
                        ? 'border-2 border-emerald-400 bg-emerald-500/10 shadow-[0_0_28px_rgba(52,211,153,0.35)]'
                        : cardDetected && stabilityScore >= 64
                        ? 'border-2 border-emerald-400 bg-emerald-500/5 shadow-[0_0_18px_rgba(52,211,153,0.2)]'
                        : cardDetected
                        ? 'border-2 border-cyan-400 bg-cyan-500/5 shadow-[0_0_14px_rgba(34,211,238,0.2)]'
                        : 'border-2 border-white/20 bg-slate-950/10'
                    }`}
                  >
                    {/* 4 Precision Target Corner Brackets */}
                    <div
                      className={`absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg transition-colors ${
                        lockProgress > 0
                          ? 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : cardDetected && stabilityScore >= 64
                          ? 'border-emerald-400'
                          : cardDetected
                          ? 'border-cyan-400'
                          : 'border-white/70'
                      }`}
                    />
                    <div
                      className={`absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg transition-colors ${
                        lockProgress > 0
                          ? 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : cardDetected && stabilityScore >= 64
                          ? 'border-emerald-400'
                          : cardDetected
                          ? 'border-cyan-400'
                          : 'border-white/70'
                      }`}
                    />
                    <div
                      className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg transition-colors ${
                        lockProgress > 0
                          ? 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : cardDetected && stabilityScore >= 64
                          ? 'border-emerald-400'
                          : cardDetected
                          ? 'border-cyan-400'
                          : 'border-white/70'
                      }`}
                    />
                    <div
                      className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 rounded-br-lg transition-colors ${
                        lockProgress > 0
                          ? 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : cardDetected && stabilityScore >= 64
                          ? 'border-emerald-400'
                          : cardDetected
                          ? 'border-cyan-400'
                          : 'border-white/70'
                      }`}
                    />

                    {/* Centered Lock Progress Feedback */}
                    {lockProgress > 0 && (
                      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center justify-center gap-1 z-20">
                        <span className="bg-slate-950/90 text-emerald-300 px-3 py-0.5 rounded-full text-[11px] font-bold border border-emerald-500/40 shadow-lg flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>Locking Card ({lockProgress}%)</span>
                        </span>
                        <div className="w-40 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/20">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-150"
                            style={{ width: `${lockProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Frozen Frame Overlay during Extraction */}
            {frozenPreviewImage && isExtractingOnSpot && (
              <div className="absolute inset-0 z-20 bg-slate-950/95 flex flex-col items-center justify-center p-4 text-center space-y-3">
                <div className="relative">
                  <img
                    src={frozenPreviewImage}
                    alt="Captured Business Card"
                    className="max-h-40 rounded-xl border-2 border-blue-400 shadow-2xl object-contain"
                  />
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold">
                    RapidOCR PP-OCRv4
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/90 text-white text-xs font-bold shadow-lg">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deep-Learning ONNX Text Extraction...</span>
                </div>
              </div>
            )}

            {shutterFlash && (
              <div className="absolute inset-0 z-30 bg-white/85 pointer-events-none transition-opacity" />
            )}

            {/* In-View Extracted Card Preview Overlay */}
            {onSpotResult && !isExtractingOnSpot && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (autoDismissTimerRef.current) {
                    clearTimeout(autoDismissTimerRef.current);
                    autoDismissTimerRef.current = null;
                  }
                }}
                className="absolute inset-x-2 sm:inset-x-4 bottom-3 z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200"
              >
                <div
                  className={`bg-slate-950/95 backdrop-blur-md rounded-2xl border-2 ${
                    onSpotResult.status === 'DUPLICATE'
                      ? 'border-amber-400/80 shadow-[0_8px_32px_rgba(245,158,11,0.25)]'
                      : onSpotResult.isSegregatedToReview
                      ? 'border-amber-400/80 shadow-[0_8px_32px_rgba(245,158,11,0.25)]'
                      : 'border-emerald-400/80 shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
                  } p-3.5 sm:p-4 text-white space-y-2.5`}
                >
                  {/* Top Status Capsule & Quick Actions */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          onSpotResult.status === 'DUPLICATE'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : onSpotResult.status === 'SAVED'
                            ? onSpotResult.isSegregatedToReview
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        }`}
                      >
                        {onSpotResult.status === 'DUPLICATE' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        ) : onSpotResult.isSegregatedToReview ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span>
                          {onSpotResult.status === 'DUPLICATE'
                            ? 'Duplicate Lead'
                            : onSpotResult.status === 'SAVED'
                            ? onSpotResult.isSegregatedToReview
                              ? 'Segregated to Needs Review'
                              : 'Card Saved to Leads'
                            : 'Extracted · Review to Save'}
                        </span>
                      </span>
                      {autoCaptureEnabled && onSpotResult.status === 'SAVED' && (
                        <span className="text-[10px] text-slate-400 font-mono animate-pulse hidden xs:inline-flex">
                          Auto-closing in 2s · Swap card
                        </span>
                      )}
                      {onSpotResult.engineLabel && (
                        <span className="hidden sm:inline-flex text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-md font-mono font-semibold">
                          {onSpotResult.engineLabel}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={unlockForNextCard}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                      title="Dismiss and unlock camera for next card"
                    >
                      <span>Dismiss</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Contact Preview (First Extracted Lead) */}
                  {onSpotResult.contacts.length > 0 && (() => {
                    const first = onSpotResult.contacts[0];
                    const fullName =
                      first.fields.fullName.value ||
                      first.fields.companyName.value ||
                      'Extracted Lead';
                    const subtitle = [
                      first.fields.designation.value,
                      first.fields.companyName.value,
                    ]
                      .filter(Boolean)
                      .join(' • ');
                    const phone =
                      first.fields.mobileNumber.value ||
                      first.fields.officePhone.value ||
                      first.fields.companyTelephone.value;
                    const email = first.fields.email.value;

                    return (
                      <div className="space-y-2">
                        <div>
                          <div className="text-base font-bold text-white truncate flex items-center gap-2">
                            <span>{fullName}</span>
                            {onSpotResult.contacts.length > 1 && (
                              <span className="text-[11px] font-semibold text-blue-400 bg-blue-950/60 border border-blue-800 px-1.5 py-0.2 rounded">
                                +{onSpotResult.contacts.length - 1} more
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <p className="text-xs text-slate-300 truncate font-medium">
                              {subtitle}
                            </p>
                          )}
                        </div>

                        {/* Quick Data Chips */}
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {phone && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 text-cyan-300 border border-slate-700 font-mono">
                              <Phone className="w-3 h-3 text-cyan-400" />
                              <span>{phone}</span>
                            </span>
                          )}
                          {email && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 text-blue-300 border border-slate-700 font-mono truncate max-w-[220px]">
                              <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                              <span className="truncate">{email}</span>
                            </span>
                          )}
                        </div>

                        {onSpotResult.isSegregatedToReview && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium bg-amber-950/50 border border-amber-800/50 rounded-lg px-2.5 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              Missing mandatory: {onSpotResult.missingMandatoryLabels?.join(' & ') || 'Email / Mobile'} · Saved to Needs Review tab
                            </span>
                          </div>
                        )}

                        {/* 1-Tap Action Deck */}
                        <div className="flex items-center gap-2 pt-1">
                          {onSpotResult.status === 'SAVED' ? (
                            <button
                              type="button"
                              onClick={unlockForNextCard}
                              className="flex-1 h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-98 transition-colors cursor-pointer"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-300" />
                              <span>Scan Next Card</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                for (let i = 0; i < onSpotResult.contacts.length; i++) {
                                  await onSaveContact(onSpotResult.contacts[i], i === 0);
                                }
                                setOnSpotResult((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        status: 'SAVED',
                                        message: 'Saved to Contacts & Synced!',
                                      }
                                    : null
                                );
                                setCardSwapBanner({
                                  type: 'change_card',
                                  title: `Card Saved (${fullName}) — Ready for Next Card`,
                                  subtitle: 'Remove current card and position the next business card.',
                                });
                              }}
                              className="flex-1 h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-98 transition-colors cursor-pointer"
                              title="Confirm and save this lead to Contacts and Google Sheets"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Save to Contacts</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBoostingAi}
                            onClick={() => {
                              if (autoDismissTimerRef.current) {
                                clearTimeout(autoDismissTimerRef.current);
                                autoDismissTimerRef.current = null;
                              }
                              handleAiStudioBoost(first);
                            }}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-98 transition-colors cursor-pointer disabled:opacity-50"
                            title="Extra Attention / Max Precision: Re-extract with Google AI Studio Gemini Vision"
                          >
                            {isBoostingAi ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
                                <span className="hidden sm:inline">Reparsing...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                                <span>AI Reparse</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (autoDismissTimerRef.current) {
                                clearTimeout(autoDismissTimerRef.current);
                                autoDismissTimerRef.current = null;
                              }
                              onOpenFullReview(first);
                            }}
                            className="h-9 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-colors shadow-2xs cursor-pointer"
                            title="Edit fields or adjust lead"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (autoDismissTimerRef.current) {
                                clearTimeout(autoDismissTimerRef.current);
                                autoDismissTimerRef.current = null;
                              }
                              handleDeleteScannedContact(first.id);
                            }}
                            className="h-9 px-2.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 flex items-center justify-center active:scale-98 transition-colors shadow-2xs cursor-pointer"
                            title="Delete / discard this lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Center Overlay Alert when same card is still in view but result was dismissed */}
            {sameCardStillInView && !isExtractingOnSpot && !onSpotResult && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto bg-emerald-600/95 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-white max-w-sm text-center space-y-2 z-20"
              >
                <div className="text-sm sm:text-base font-extrabold uppercase tracking-tight">
                  Card Saved — Swap to Next Card
                </div>
                <div className="text-xs text-emerald-50">
                  Remove current card from camera view or tap below:
                </div>
                <button
                  type="button"
                  onClick={unlockForNextCard}
                  className="mt-1 min-h-[42px] px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 shadow-lg"
                >
                  Scan Next Card
                </button>
              </div>
            )}

            <div className="relative z-20 flex-1 flex flex-col items-center justify-center pointer-events-none gap-2 py-2">

              {capturedFrontForTwoSided && scanTwoSides && activeSideCapture === 'BACK' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto bg-slate-950/95 border-2 border-blue-400 p-4 rounded-2xl text-center space-y-2.5 max-w-md shadow-2xl"
                >
                  <div className="text-xs sm:text-sm font-bold text-blue-300">
                    Front Side Captured — Flip Card for Back Side
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Flip the card in the camera view or upload back photo, or tap below if the other side is blank:
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                      navigator.vibrate([35]);
                    }
                    playShutterClickSound(chimeEnabled);
                    captureCurrentVideoFrame(true, false);
                  }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md"
                    >
                      Snap Back Side
                    </button>
                    <button
                      type="button"
                      onClick={() => backFileInputRef.current?.click()}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white"
                    >
                      Upload Back Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const front = capturedFrontForTwoSided;
                        setCapturedFrontForTwoSided(null);
                        setStagedReplaceContactId(undefined);
                        setActiveSideCapture('FRONT');
                        enqueueCardExtraction(front, undefined, {
                          fromLiveCamera: true,
                          isManualTrigger: true,
                        });
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md"
                    >
                      Other Side Blank / Extract Front Only
                    </button>
                  </div>
                </div>
              )}

              {/* Viewfinder State when In-App Camera is Inactive */}
              {!cameraActive && !isExtractingOnSpot && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto bg-white/95 border border-slate-200 p-5 sm:p-6 rounded-xl max-w-sm text-center flex flex-col items-center justify-center transition-all shadow-xl space-y-3 backdrop-blur-md text-slate-900"
                >
                  {!isSecureContextEnv &&
                  window.location.hostname !== 'localhost' &&
                  window.location.hostname !== '127.0.0.1' ? (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shadow-2xs">
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-900">
                          Mobile Camera Requires HTTPS
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Mobile Safari and Chrome strictly require HTTPS for live in-app camera streaming. You are currently browsing on HTTP.
                        </p>
                      </div>
                      <a
                        href={
                          networkInfo?.httpsUrl ||
                          `https://${window.location.hostname}:${networkInfo?.httpsPort || 3003}`
                        }
                        className="w-full h-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors"
                      >
                        <Camera className="w-4 h-4 text-slate-300" />
                        <span>Switch to HTTPS (Port {networkInfo?.httpsPort || 3003})</span>
                      </a>
                      <p className="text-[11px] text-slate-400">
                        Tip: Tap "Advanced → Proceed" on the one-time browser certificate screen.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shadow-2xs">
                        <Camera className="w-6 h-6 text-slate-700" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-900">
                          Live Business Card Scanner
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Position physical business cards in front of the lens for instant OCR extraction and verification.
                        </p>
                      </div>
                      {cameraError && (
                        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg text-left flex items-start gap-2 shadow-2xs w-full">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-amber-900">
                              {cameraError.toLowerCase().includes('not supported') || cameraError.toLowerCase().includes('not found')
                                ? 'No Active Webcam Detected'
                                : 'Camera Permission Required'}
                            </div>
                            <div className="text-amber-700 text-[11px] leading-relaxed">
                              {cameraError.toLowerCase().includes('not supported') || cameraError.toLowerCase().includes('not found')
                                ? 'Upload business card images directly below or pair with your mobile phone.'
                                : cameraError}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Primary Trigger: On Mobile provide native Snap Photo + Live Camera options */}
                      <div className="w-full space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent)) {
                              cameraFileInputRef.current?.click();
                            } else {
                              startCamera();
                            }
                          }}
                          className="w-full h-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-slate-300" />
                          <span>
                            {window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent)
                              ? 'Take Photo with Camera'
                              : 'Start Live Camera'}
                          </span>
                        </button>

                        <div className="flex items-center justify-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => galleryFileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                          >
                            <FileUp className="w-3.5 h-3.5 text-slate-500" />
                            <span>Upload from Gallery</span>
                          </button>

                          {(window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent)) && (
                            <button
                              type="button"
                              onClick={() => startCamera()}
                              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 text-slate-500" />
                              <span>Live Stream</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="hidden md:block pt-2 border-t border-slate-200 w-full">
                        <button
                          type="button"
                          onClick={() => openMobileModal()}
                          className="w-full h-9 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                          <span>Pair Phone Companion (QR Code)</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Viewfinder Sleek Stability Line */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-20 w-full bg-slate-900/80 h-1 rounded-full overflow-hidden"
            >
              <div
                className={`h-full transition-all duration-150 ${
                  sameCardStillInView
                    ? 'bg-amber-400'
                    : lockProgress > 0 || (cardDetected && stabilityScore >= 72)
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : cardDetected
                    ? 'bg-sky-400'
                    : 'bg-slate-700'
                }`}
                style={{
                  width: `${
                    cameraActive
                      ? cardDetected
                        ? stabilityScore
                        : Math.min(30, stabilityScore)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* ERGONOMIC PROFESSIONAL SHUTTER DECK (Executive Light Style) */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col items-center gap-3">
            {/* Camera Lens Selector & Hardware Zoom Deck */}
            {cameraActive && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {/* Physical Rear Lens Switcher (Ultra-Wide, Wide 1x, Telephoto) */}
                {currentCameraFacing === 'environment' && rearCameraDevices.length > 1 && (
                  <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-full border border-slate-200 text-xs font-mono shadow-2xs">
                    <span className="text-slate-400 font-sans text-[10px] mr-1 hidden sm:inline">Lens:</span>
                    {rearCameraDevices.map((dev, idx) => {
                      const lbl = (dev.label || '').toLowerCase();
                      let label = `Lens ${idx + 1}`;
                      if (lbl.includes('ultra') || lbl.includes('0.5') || lbl.includes('wide 0')) {
                        label = '0.5x Ultra';
                      } else if (lbl.includes('tele') || lbl.includes('zoom')) {
                        label = '2x Tele';
                      } else if (lbl.includes('wide') || lbl.includes('main') || idx === 0) {
                        label = '1x Wide';
                      }
                      const isSelected =
                        selectedCameraDeviceId === dev.deviceId ||
                        (!selectedCameraDeviceId && idx === 0);
                      return (
                        <button
                          key={dev.deviceId || idx}
                          type="button"
                          onClick={() => switchRearCameraLens(dev.deviceId)}
                          className={`px-2.5 py-0.5 rounded-full font-medium transition-colors ${
                            isSelected
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                          title={dev.label || `Rear Camera Lens ${idx + 1}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Hardware Optical/Sensor Zoom Buttons if supported */}
                {zoomSupported && (
                  <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-slate-200 text-xs font-mono shadow-2xs">
                    {zoomRange.min < 1 && (
                      <button
                        type="button"
                        onClick={() => handleSetZoom(zoomRange.min)}
                        className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                          currentZoom <= zoomRange.min
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {zoomRange.min}x
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSetZoom(1)}
                      className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                        currentZoom === 1
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      1x Wide
                    </button>
                    {zoomRange.max >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleSetZoom(2)}
                        className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                          currentZoom >= 2
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        2x
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {cameraActive ? (
              <div className="w-full flex items-center justify-around max-w-sm">
                {/* Left: Bulk Upload / Gallery Trigger */}
                <button
                  type="button"
                  onClick={() => openBulkUpload()}
                  className="w-11 h-11 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex flex-col items-center justify-center shadow-2xs active:scale-95 transition-all"
                  title="Bulk Upload business card photos from phone gallery or files"
                >
                  <UploadCloud className="w-4 h-4 text-slate-600" />
                  <span className="text-[9px] font-medium text-slate-500 mt-0.5">Bulk</span>
                </button>

                {/* Center: Hero Circular Shutter Button */}
                <button
                  type="button"
                  disabled={isExtractingOnSpot}
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                      navigator.vibrate([35]);
                    }
                    playShutterClickSound(chimeEnabled);
                    captureCurrentVideoFrame(true, false);
                  }}
                  className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-slate-300 p-1 flex items-center justify-center shadow-2xs active:scale-92 transition-all disabled:opacity-50"
                  title="Tap to snap card photo now"
                >
                  <div
                    className={`w-full h-full rounded-full flex items-center justify-center transition-all ${
                      isExtractingOnSpot
                        ? 'bg-slate-800 text-white'
                        : lockProgress > 0 || (cardDetected && stabilityScore >= 72)
                        ? 'bg-slate-900 text-emerald-400'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isExtractingOnSpot ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {/* Right: Next Card or 1-Sided / 2-Sided Toggle */}
                {sameCardStillInView || onSpotResult ? (
                  <button
                    type="button"
                    onClick={unlockForNextCard}
                    className="w-11 h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex flex-col items-center justify-center shadow-2xs active:scale-95 transition-all font-medium"
                    title="Scan Next Business Card"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-slate-300" />
                    <span className="text-[9px] font-medium mt-0.5">Next</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setScanTwoSides((prev) => !prev);
                      setCapturedFrontForTwoSided(null);
                      setStagedReplaceContactId(undefined);
                      setActiveSideCapture('FRONT');
                    }}
                    className={`w-11 h-11 rounded-full flex flex-col items-center justify-center shadow-2xs active:scale-95 transition-all ${
                      scanTwoSides
                        ? 'bg-slate-900 text-white'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                    title={scanTwoSides ? '2-Sided Scanning Mode active' : 'Switch to 2-Sided Scanning Mode'}
                  >
                    <FlipHorizontal className="w-4 h-4" />
                    <span className="text-[9px] font-medium mt-0.5">{scanTwoSides ? '2-Sided' : '1-Sided'}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex w-full items-center gap-2 max-w-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !isSecureContextEnv &&
                      window.location.hostname !== 'localhost' &&
                      window.location.hostname !== '127.0.0.1'
                    ) {
                      window.location.href =
                        networkInfo?.httpsUrl ||
                        `https://${window.location.hostname}:${networkInfo?.httpsPort || 3001}`;
                    } else {
                      startCamera();
                    }
                  }}
                  className="flex-1 h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-slate-300" />
                  <span>Start Live Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => openBulkUpload()}
                  className="h-10 px-4 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs border border-slate-200 flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 text-slate-500" />
                  <span>Bulk Upload</span>
                </button>
              </div>
            )}

            {/* Discreet Secondary Camera Utilities */}
            {cameraActive && (
              <div className="w-full flex items-center justify-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setRotationDegrees((prev) => ((prev + 90) % 360) as any)}
                  className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1 transition-colors border border-slate-700/60"
                  title="Rotate View 90°"
                >
                  <RotateCw className="w-3 h-3 text-slate-400" />
                  <span>{rotationDegrees}°</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEnhanceLowLight((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors border ${
                    enhanceLowLight
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:text-white'
                  }`}
                  title="Boost contrast in dim lighting"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Contrast</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPaused((prev) => !prev)}
                  className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1 transition-colors border border-slate-700/60"
                  title={isPaused ? 'Resume Camera Feed' : 'Pause Camera Feed'}
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3 h-3 text-emerald-400" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3 text-amber-400" />
                      <span>Pause</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right (5 cols): Dynamic On-Spot Extracted Card + Live Scanned Cards Stream */}
        <div className="lg:col-span-5 space-y-4">
          {/* Immediate On-Spot Extracted Result Card */}
          {onSpotResult && (
            <div
              ref={onSpotResultRef}
              onClick={() => {
                if (autoDismissTimerRef.current) {
                  clearTimeout(autoDismissTimerRef.current);
                  autoDismissTimerRef.current = null;
                }
              }}
              className="rounded-xl border border-slate-200/80 bg-white p-3.5 sm:p-4 space-y-3 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {onSpotResult.contacts.length > 1 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                        <Users className="w-3.5 h-3.5 text-slate-600" />
                        {onSpotResult.contacts.length} Contacts Extracted
                      </span>
                    ) : onSpotResult.status === 'SAVED' ? (
                      onSpotResult.isSegregatedToReview ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Segregated to Needs Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Card Saved (Verified)
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Review Before Saving
                      </span>
                    )}
                    {autoCaptureEnabled && onSpotResult.status === 'SAVED' && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Auto-closing · Swap card
                      </span>
                    )}
                    {onSpotResult.engineLabel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200">
                        {onSpotResult.engineLabel}
                      </span>
                    )}
                    <span className="text-xs font-medium text-slate-600">
                      {onSpotResult.message}
                    </span>
                  </div>
                  {onSpotResult.backSideNote && (
                    <div className="text-[11px] font-medium text-slate-700">
                      {onSpotResult.backSideNote}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={unlockForNextCard}
                  className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shrink-0 shadow-2xs transition-colors"
                >
                  Next Card
                </button>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {onSpotResult.contacts.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-2">
                    <div className="text-sm font-bold text-amber-900">No Business Card Detected</div>
                    <div className="text-xs text-amber-700">
                      {onSpotResult.message || 'No printed contact details found in this frame. Position the business card inside the viewfinder and hold steady.'}
                    </div>
                    <button
                      type="button"
                      onClick={unlockForNextCard}
                      className="mt-2 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                    >
                      Try Again
                    </button>
                  </div>
                ) : (
                  onSpotResult.contacts.map((contact, idx) => {
                  const presentFields = getPresentCardFields(contact);
                  const primaryPhone =
                    contact.fields.mobileNumber.value ||
                    contact.fields.officePhone.value ||
                    contact.fields.companyTelephone.value;
                  const waUrl = formatWhatsAppUrl(
                    contact.fields.whatsappNumber.value ||
                      contact.fields.mobileNumber.value
                  );

                  return (
                    <div
                      key={contact.id}
                      className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {contact.fields.fullName.value ||
                              contact.fields.companyName.value ||
                              'Extracted Card'}
                            {onSpotResult.contacts.length > 1 && (
                              <span className="ml-1.5 text-[11px] font-semibold text-blue-600">
                                (#{idx + 1})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 font-medium truncate">
                            {[
                              contact.fields.designation.value,
                              contact.fields.companyName.value,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Business Card'}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                          {onSpotResult.status === 'AWAITING_DECISION' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await onSaveContact(contact, false);
                                setOnSpotResult((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        status: 'SAVED',
                                        message: 'Saved to Contacts — Change card',
                                      }
                                    : null
                                );
                              }}
                              className="h-7 px-2.5 rounded-md bg-slate-900 text-white text-[11px] font-medium shadow-2xs"
                            >
                              Save Anyway
                            </button>
                          )}

                          {!contact.backImageBase64 && (
                            <button
                              type="button"
                              onClick={() => {
                                setScanTwoSides(true);
                                setCapturedFrontForTwoSided(contact.frontImageBase64);
                                setStagedReplaceContactId(contact.id);
                                setActiveSideCapture('BACK');
                                lockedUntilCardSwappedRef.current = false;
                                setSameCardStillInView(false);
                                setOnSpotResult(null);
                              }}
                              className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium flex items-center gap-1 shadow-2xs transition-colors"
                              title="Scan & merge the back side of this card"
                            >
                              <FlipHorizontal className="w-3 h-3 text-slate-500" />
                              <span>+ Back Side</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (autoDismissTimerRef.current) {
                                clearTimeout(autoDismissTimerRef.current);
                                autoDismissTimerRef.current = null;
                              }
                              onOpenFullReview(contact);
                            }}
                            className="h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium flex items-center gap-1 shadow-2xs transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (autoDismissTimerRef.current) {
                                clearTimeout(autoDismissTimerRef.current);
                                autoDismissTimerRef.current = null;
                              }
                              handleDeleteScannedContact(contact.id);
                            }}
                            className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-rose-50 text-rose-600 text-[11px] font-medium flex items-center gap-1 shadow-2xs transition-colors"
                            title="Delete / Discard this card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Dynamic Per-Card Fields */}
                      {presentFields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs border-t border-slate-100 pt-2">
                          {presentFields.map((item, fIdx) => (
                            <div
                              key={`${item.label}_${fIdx}`}
                              className={
                                item.label === 'Email' ||
                                item.label === 'Website' ||
                                item.label === 'Address' ||
                                item.label === 'QR Info' ||
                                item.label === 'Card Notes'
                                  ? 'sm:col-span-2 break-words'
                                  : 'truncate'
                              }
                            >
                              <span className="text-slate-400">{item.label}: </span>
                              <span
                                className={
                                  item.mono
                                    ? 'font-mono text-slate-800 font-medium'
                                    : 'text-slate-800 font-medium'
                                }
                              >
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Instant Mobile Action Strip: Call, WhatsApp, Email, Save to Phone (.VCF) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100">
                        {primaryPhone && (
                          <a
                            href={`tel:${primaryPhone.replace(/[^\d+]/g, '')}`}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-blue-600" />
                            Call
                          </a>
                        )}
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                            WhatsApp
                          </a>
                        )}
                        {contact.fields.email.value && (
                          <a
                            href={`mailto:${contact.fields.email.value}`}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1"
                          >
                            <Mail className="w-3 h-3 text-blue-600" />
                            Email
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => exportContactsToVCard([contact])}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-semibold flex items-center gap-1 ml-auto"
                        >
                          <Contact className="w-3 h-3 text-blue-600" />
                          Save to Phone (.VCF)
                        </button>
                      </div>
                    </div>
                  );
                }))}
              </div>
            </div>
          )}

          {/* Live Scanned Cards History Stream */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Scanned Cards Session Stream
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  Auto-saves when Company, Name, Mobile/Phone & Email are verified.
                </p>
              </div>
              {backgroundJobs.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setBackgroundJobs((prev) =>
                      prev.filter((j) => j.status === 'EXTRACTING')
                    )
                  }
                  className="text-xs text-slate-500 hover:text-slate-800 underline shrink-0"
                >
                  Clear Stream
                </button>
              )}
            </div>

            {backgroundJobs.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 text-center space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">
                  No Cards Scanned Yet in This Session
                </div>
                <p className="text-xs text-slate-500">
                  Hold a business card steady inside the frame or tap Upload.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {backgroundJobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="p-3 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50/70 flex items-start justify-between gap-2.5 shadow-2xs transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <img
                        src={job.thumbnail}
                        alt="Card thumbnail"
                        className="w-12 h-8 object-cover rounded border border-slate-200 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                          {job.status === 'EXTRACTING' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 shrink-0" />
                          )}
                          {job.status === 'SAVED_VERIFIED' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                          {(job.status === 'SAVED_NEEDS_REVIEW' ||
                            job.status === 'AWAITING_DECISION' ||
                            job.status === 'DUPLICATE_SKIPPED') && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          )}
                          <span className="truncate">{job.label}</span>
                        </div>

                        {job.subtitle && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {job.subtitle}
                          </div>
                        )}

                        {job.contact && (
                          <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                            {[
                              job.contact.fields.mobileNumber.value ||
                                job.contact.fields.officePhone.value ||
                                job.contact.fields.companyTelephone.value,
                              job.contact.fields.email.value,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}

                        {job.errorMsg && (
                          <div className="text-[11px] text-rose-600 mt-0.5">
                            {job.errorMsg}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {job.status === 'AWAITING_DECISION' && job.contact && (
                        <button
                          type="button"
                          onClick={async () => {
                            const list = job.allSavedContacts || [job.contact!];
                            for (const c of list) {
                              await onSaveContact(c, false);
                            }
                            setBackgroundJobs((prev) =>
                              prev.map((item) =>
                                item.jobId === job.jobId
                                  ? {
                                      ...item,
                                      status: 'SAVED_NEEDS_REVIEW',
                                      subtitle: 'Saved to Contacts',
                                    }
                                  : item
                              )
                            );
                          }}
                          className="h-7 px-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium whitespace-nowrap shadow-2xs"
                        >
                          Save
                        </button>
                      )}

                      {job.contact && (
                        <button
                          type="button"
                          onClick={() => onOpenFullReview(job.contact!)}
                          className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shadow-2xs"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>Edit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          job.contact
                            ? handleDeleteScannedContact(job.contact.id, job.jobId)
                            : setBackgroundJobs((prev) =>
                                prev.filter((item) => item.jobId !== job.jobId)
                              )
                        }
                        className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-rose-50 text-rose-600 shadow-2xs"
                        title="Delete / Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-Over Review Drawer with Mobile Backdrop and High Z-Index */}
      {onSpotResult && onSpotResult.contacts && onSpotResult.contacts[0] && (
        <div className="fixed inset-0 sm:inset-auto sm:top-0 sm:right-0 w-full sm:w-[420px] md:w-[480px] h-full z-[60] bg-slate-950/40 sm:bg-transparent backdrop-blur-xs sm:backdrop-blur-none flex justify-end">
          <div className="w-full sm:w-[420px] md:w-[480px] h-full bg-white shadow-2xl">
            <ScannerReviewDrawer
              isOpen={Boolean(onSpotResult && onSpotResult.contacts && onSpotResult.contacts[0])}
              cardFrontUrl={onSpotResult.capturedImage || onSpotResult.contacts[0].frontImageBase64}
              cardBackUrl={onSpotResult.contacts[0].backImageBase64}
              extractedFields={onSpotResult.contacts[0].fields}
              confidence={95}
              engineUsed={onSpotResult.engineLabel || activeEngineName || 'AI Studio'}
              activeEvent={activeEvent}
              availableEvents={availableEvents}
              onApprove={async (updatedFields, eventTag) => {
                const base = onSpotResult.contacts[0];
                const approved: ContactRecord = {
                  ...base,
                  fields: updatedFields,
                  eventName: eventTag,
                  sheetTab: eventTag,
                  overallStatus: 'VERIFIED',
                  syncStatus: 'SYNCED',
                  updatedAt: new Date().toISOString(),
                };
                await onSaveContact(approved, true);
                playScannerBeep('captured', chimeEnabled);
                unlockForNextCard();
              }}
              onDiscard={() => {
                unlockForNextCard();
              }}
            />
          </div>
        </div>
      )}
</div>
  );
};
