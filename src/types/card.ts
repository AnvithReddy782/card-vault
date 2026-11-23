export type VerificationStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'MISSING';

export type FieldSource = 'FRONT' | 'BACK' | 'BOTH' | 'AI_INFERRED' | 'USER_EDITED' | 'NONE';

export const INDUSTRY_CATEGORIES = [
  'Information Technology',
  'Software Development',
  'Healthcare',
  'Medical Equipment',
  'Construction',
  'Real Estate',
  'Financial Services',
  'Consulting',
  'Education',
  'Hospitality',
  'Retail',
  'Manufacturing',
  'Logistics',
  'Telecommunications',
  'Government',
  'Marketing and Advertising',
  'Engineering',
  'Other / Unclassified',
] as const;

export type IndustryCategory = (typeof INDUSTRY_CATEGORIES)[number] | string;

export interface ExtractedField {
  value: string;
  confidence: number; // 0 to 100
  status: VerificationStatus;
  source: FieldSource;
  isUnclear?: boolean;
  validationIssue?: string;
}

export interface FrontBackConflict {
  fieldKey: string;
  fieldLabel: string;
  frontValue: string;
  backValue: string;
  resolutionNote: string;
}

export interface CustomCardField {
  id: string;
  label: string;
  value: string;
  confidence: number;
  source: FieldSource;
}

export type ImageQualityIssue =
  | 'low_light'
  | 'glare'
  | 'blurry'
  | 'tilted'
  | 'small_text'
  | 'complex_background'
  | 'damaged_or_faded';

export interface ContactFields {
  // Contact Information
  fullName: ExtractedField;
  firstName: ExtractedField;
  lastName: ExtractedField;
  designation: ExtractedField;
  department: ExtractedField;
  mobileNumber: ExtractedField;
  officePhone: ExtractedField;
  whatsappNumber: ExtractedField;
  email: ExtractedField;
  secondaryEmail: ExtractedField;
  website: ExtractedField;
  linkedIn: ExtractedField;
  otherSocialMedia: ExtractedField;

  // Company Information
  companyName: ExtractedField;
  companyCategory: ExtractedField;
  businessActivity: ExtractedField;
  companyWebsite: ExtractedField;
  companyAddress: ExtractedField;
  country: ExtractedField;
  city: ExtractedField;
  poBox: ExtractedField;
  officeLocation: ExtractedField;
  companyTelephone: ExtractedField;

  // Additional Information
  faxNumber: ExtractedField;
  registrationInfo: ExtractedField;
  qrCodeInfo: ExtractedField;
  otherRelevantText: ExtractedField;
}

export type CoreFieldKey =
  | 'fullName'
  | 'companyName'
  | 'designation'
  | 'primaryPhone'
  | 'email';

export interface CoreFieldValidationSummary {
  allCoreVerified: boolean;
  missingCoreFields: { key: CoreFieldKey; label: string }[];
  uncertainCoreFields: { key: CoreFieldKey; label: string; reason: string }[];
  otherReviewIssues: string[];
  overallStatus: VerificationStatus;
}

export interface ContactRecord {
  id: string;
  scanHash: string;
  createdAt: string;
  updatedAt: string;
  overallStatus: VerificationStatus;
  savedWithoutCoreFields?: boolean;
  missingCoreFieldLabels: string[];
  reviewReasons: string[];
  duplicateOfId?: string;
  duplicateMatchReason?: string;

  // Original Images & OCR Evidence
  frontImageBase64: string;
  backImageBase64?: string;
  rawOcrFront: string;
  rawOcrBack?: string;
  cardOrientation: 'horizontal' | 'vertical';
  imageQualityIssues: ImageQualityIssue[];
  frontBackConflicts: FrontBackConflict[];

  // Structured Fields
  fields: ContactFields;
  customFields: CustomCardField[];

  // Event / Target Tab Organization
  eventName?: string;
  sheetTab?: string;

  // Sync status
  syncStatus: 'SYNCED' | 'PENDING_SYNC' | 'LOCAL_ONLY';

  // Per-Scan Extraction & Decision Audit Log
  scanLog?: ScanDiagnosticLog;
}

export interface ScanDiagnosticDecision {
  lineIndex: number;
  lineText: string;
  assignedField?: string;
  fieldLabel?: string;
  confidence: number;
  reason: string;
}

export interface ScanDiagnosticLog {
  timestamp: string;
  engineUsed: string;
  totalLinesDetected: number;
  rawLines: Array<{ lineIdx: number; text: string; confidence?: number }>;
  decisions: ScanDiagnosticDecision[];
  anomalies: string[];
  disambiguationNotes: string[];
}

export interface PendingOfflineScan {
  id: string;
  scanHash: string;
  frontImageBase64: string;
  backImageBase64?: string;
  capturedAt: string;
  status: 'QUEUED_OFFLINE' | 'PROCESSING' | 'FAILED';
  retryCount: number;
  lastError?: string;
  cardLabel?: string;
}

export interface ScanSessionStats {
  totalScanned: number;
  autoSavedVerified: number;
  savedNeedsReview: number;
  failedScans: number;
}
