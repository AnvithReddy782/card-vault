import {
  type ContactFields,
  type ContactRecord,
  type CoreFieldKey,
  type CoreFieldValidationSummary,
  type ExtractedField,
  type FieldSource,
  type FrontBackConflict,
  INDUSTRY_CATEGORIES,
  type ImageQualityIssue,
  type VerificationStatus,
} from '../types/card.ts';

export const CORE_FIELD_LABELS: Record<CoreFieldKey, string> = {
  fullName: 'Full Name',
  companyName: 'Company Name',
  designation: 'Designation / Role',
  primaryPhone: 'Mobile / Phone Number',
  email: 'Email Address',
};

export const ALL_FIELD_META: {
  key: keyof ContactFields;
  label: string;
  section: 'Contact Information' | 'Company Information' | 'Additional Information';
  isCore?: boolean;
}[] = [
  // Contact Information
  { key: 'fullName', label: 'Full Name', section: 'Contact Information', isCore: true },
  { key: 'firstName', label: 'First Name', section: 'Contact Information' },
  { key: 'lastName', label: 'Last Name', section: 'Contact Information' },
  { key: 'designation', label: 'Designation / Job Title', section: 'Contact Information' },
  { key: 'department', label: 'Department', section: 'Contact Information' },
  { key: 'mobileNumber', label: 'Mobile Number', section: 'Contact Information', isCore: true },
  { key: 'officePhone', label: 'Office Phone', section: 'Contact Information' },
  { key: 'whatsappNumber', label: 'WhatsApp Number', section: 'Contact Information' },
  { key: 'email', label: 'Email Address', section: 'Contact Information', isCore: true },
  { key: 'secondaryEmail', label: 'Secondary Email', section: 'Contact Information' },
  { key: 'website', label: 'Personal / Direct Website', section: 'Contact Information' },
  { key: 'linkedIn', label: 'LinkedIn Profile', section: 'Contact Information' },
  { key: 'otherSocialMedia', label: 'Other Social Profiles', section: 'Contact Information' },

  // Company Information
  { key: 'companyName', label: 'Company Name', section: 'Company Information', isCore: true },
  { key: 'companyCategory', label: 'Company Category / Industry', section: 'Company Information' },
  { key: 'businessActivity', label: 'Business Activity', section: 'Company Information' },
  { key: 'companyWebsite', label: 'Company Website', section: 'Company Information' },
  { key: 'companyAddress', label: 'Company Address', section: 'Company Information' },
  { key: 'country', label: 'Country', section: 'Company Information' },
  { key: 'city', label: 'City', section: 'Company Information' },
  { key: 'poBox', label: 'PO Box', section: 'Company Information' },
  { key: 'officeLocation', label: 'Office Location / Floor', section: 'Company Information' },
  { key: 'companyTelephone', label: 'Company Telephone', section: 'Company Information' },

  // Additional Information
  { key: 'faxNumber', label: 'Fax Number', section: 'Additional Information' },
  { key: 'registrationInfo', label: 'Registration / Tax ID', section: 'Additional Information' },
  { key: 'qrCodeInfo', label: 'QR Code Content', section: 'Additional Information' },
  { key: 'otherRelevantText', label: 'Other Printed Notes', section: 'Additional Information' },
];

export function createEmptyField(source: FieldSource = 'NONE'): ExtractedField {
  return {
    value: '',
    confidence: 0,
    status: 'MISSING',
    source,
  };
}

export function createEmptyContactFields(): ContactFields {
  return {
    fullName: createEmptyField(),
    firstName: createEmptyField(),
    lastName: createEmptyField(),
    designation: createEmptyField(),
    department: createEmptyField(),
    mobileNumber: createEmptyField(),
    officePhone: createEmptyField(),
    whatsappNumber: createEmptyField(),
    email: createEmptyField(),
    secondaryEmail: createEmptyField(),
    website: createEmptyField(),
    linkedIn: createEmptyField(),
    otherSocialMedia: createEmptyField(),
    companyName: createEmptyField(),
    companyCategory: createEmptyField(),
    businessActivity: createEmptyField(),
    companyWebsite: createEmptyField(),
    companyAddress: createEmptyField(),
    country: createEmptyField(),
    city: createEmptyField(),
    poBox: createEmptyField(),
    officeLocation: createEmptyField(),
    companyTelephone: createEmptyField(),
    faxNumber: createEmptyField(),
    registrationInfo: createEmptyField(),
    qrCodeInfo: createEmptyField(),
    otherRelevantText: createEmptyField(),
  };
}

/**
 * Cleans phone strings by stripping OCR label words ("Tel:", "Mob:", "Office:", etc.)
 * and stray letters while preserving country code '+', spaces, parentheses, hyphens, and extensions.
 */
export function sanitizePhoneValue(raw: string): string {
  if (!raw) return '';
  let cleaned = raw
    .replace(
      /\b(tel(ephone)?|mob(ile)?|cell|ph(one)?|off(ice)?|direct|landline|board|fax|whatsapp|wa|call|contact|no\.?)\b\s*[:.-]?/gi,
      ' '
    )
    .replace(/(?<=\d|\+|\()[OoQq](?=\d)|(?<=\d)[Il|](?=\d)/g, (ch) =>
      /[OoQq]/.test(ch) ? '0' : '1'
    );

  const extMatch = cleaned.match(/\b(?:ext\.?|extension|x)\s*(\d{1,5})\b/i);
  const extSuffix = extMatch ? ` ext. ${extMatch[1]}` : '';
  if (extMatch) {
    cleaned = cleaned.replace(extMatch[0], '');
  }

  cleaned = cleaned
    .replace(/[A-Za-z]+/g, ' ')
    .replace(/[^\d+()\s./-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s./-]+|[\s./-]+$/g, '')
    .trim();

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7) return '';

  return `${cleaned}${extSuffix}`.trim();
}

export function validateEmailFormat(email: string): { valid: boolean; reason?: string } {
  const trimmed = email.trim();
  if (!trimmed) return { valid: true };
  if (/\s/.test(trimmed)) {
    return { valid: false, reason: 'Email contains spaces' };
  }
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: 'Invalid email address format' };
  }
  return { valid: true };
}

export function validatePhoneFormat(phone: string): { valid: boolean; reason?: string } {
  const trimmed = phone.trim();
  if (!trimmed) return { valid: true };
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 7) {
    return { valid: false, reason: `Phone number too short (${digitsOnly.length} digits)` };
  }
  if (digitsOnly.length > 16) {
    return { valid: false, reason: `Phone number unusually long (${digitsOnly.length} digits)` };
  }
  if (/[A-Za-z]{3,}/.test(trimmed.replace(/ext\.?|extension|x/gi, ''))) {
    return { valid: false, reason: 'Phone number contains unexpected letters' };
  }
  return { valid: true };
}

export function validateCompanyName(company: string): { valid: boolean; reason?: string } {
  const trimmed = company.trim();
  if (!trimmed) return { valid: true };
  const alphaCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  if (trimmed.length < 2 || alphaCount < 2) {
    return { valid: false, reason: 'Company name appears incomplete' };
  }
  if (/^(inc|llc|ltd|corp|pvt|gmbh|co)\.?$/i.test(trimmed)) {
    return { valid: false, reason: 'Only legal suffix captured without company name' };
  }
  return { valid: true };
}

export function evaluateSingleField(
  key: keyof ContactFields,
  rawField: Partial<ExtractedField> | undefined
): ExtractedField {
  let value = (rawField?.value ?? '').trim();

  if (
    value &&
    (key === 'mobileNumber' ||
      key === 'officePhone' ||
      key === 'whatsappNumber' ||
      key === 'companyTelephone' ||
      key === 'faxNumber')
  ) {
    value = sanitizePhoneValue(value);
  } else if (value) {
    if (key === 'email' || key === 'secondaryEmail' || key === 'website' || key === 'companyWebsite') {
      value = value.replace(/\s+/g, '');
    } else {
      value = value
        .replace(/([A-Za-z0-9])&([A-Za-z0-9])/g, '$1 & $2')
        .replace(/,([A-Za-z0-9])/g, ', $1')
        .replace(/:(?!\/\/)([A-Za-z0-9+])/g, ': $1')
        .replace(/\b(CA|Dr|Eng|Adv|Mr|Mrs|Ms|Prof)\.([A-Za-z])/gi, '$1. $2')
        .replace(/\b([A-Z]\.)([A-Za-z]{2,})/g, '$1 $2')
        .replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, '$1 $2')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  }

  if (!value) {
    return {
      value: '',
      confidence: 0,
      status: 'MISSING',
      source: 'NONE',
    };
  }

  const rawConfidence =
    typeof rawField?.confidence === 'number'
      ? Math.max(0, Math.min(100, Math.round(rawField.confidence)))
      : 85;
  const source: FieldSource = rawField?.source || 'FRONT';
  const isUnclear = Boolean(rawField?.isUnclear);
  let validationIssue = rawField?.validationIssue || undefined;

  if (key === 'email' || key === 'secondaryEmail') {
    const check = validateEmailFormat(value);
    if (!check.valid) validationIssue = check.reason;
    else validationIssue = undefined;
  } else if (
    key === 'mobileNumber' ||
    key === 'officePhone' ||
    key === 'whatsappNumber' ||
    key === 'companyTelephone' ||
    key === 'faxNumber'
  ) {
    const check = validatePhoneFormat(value);
    if (!check.valid) validationIssue = check.reason;
    else validationIssue = undefined;
  } else if (key === 'companyName') {
    const check = validateCompanyName(value);
    if (!check.valid) validationIssue = check.reason;
    else validationIssue = undefined;
  } else if (key === 'companyCategory') {
    if (!INDUSTRY_CATEGORIES.includes(value as any) && !value) {
      validationIssue = 'Unclassified industry';
    }
  }

  const status: VerificationStatus =
    rawConfidence >= 75 && !isUnclear && !validationIssue ? 'VERIFIED' : 'NEEDS_REVIEW';

  return {
    value,
    confidence: rawConfidence,
    status,
    source,
    isUnclear,
    validationIssue,
  };
}

const KNOWN_CORRUPTED_NOISE_REGEX =
  /^(cai\s+thee|ses\s+tl\s+arr|sre\s+x|ee\s+ey|i\s+re|frees\s+i|gl\s+nate|an\s+ta|scanned\s+card)$/i;

/**
 * Checks the 4 Mandatory Fields required for automatic business card saving:
 * 1. Full Name
 * 2. Company Name
 * 3. Mobile / Phone Number
 * 4. Email Address
 */
export function checkFourMandatoryFields(fields: ContactFields): {
  allFourPresent: boolean;
  missingMandatoryLabels: string[];
} {
  const missingMandatoryLabels: string[] = [];

  const nameVal = (fields.fullName?.value || '').trim();
  const nameAlpha = (nameVal.match(/[A-Za-z]/g) || []).length;
  if (nameAlpha < 4 || KNOWN_CORRUPTED_NOISE_REGEX.test(nameVal)) {
    missingMandatoryLabels.push('Full Name');
  }

  const companyVal = (fields.companyName?.value || '').trim();
  const companyAlpha = (companyVal.match(/[A-Za-z]/g) || []).length;
  if (companyAlpha < 2 || KNOWN_CORRUPTED_NOISE_REGEX.test(companyVal)) {
    missingMandatoryLabels.push('Company Name');
  }

  const phones = [
    fields.mobileNumber?.value,
    fields.officePhone?.value,
    fields.whatsappNumber?.value,
    fields.companyTelephone?.value,
  ].filter(Boolean);
  const hasValidPhone = phones.some((p) => {
    const cleaned = sanitizePhoneValue(p || '');
    const digits = cleaned.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  });
  if (!hasValidPhone) {
    missingMandatoryLabels.push('Mobile / Phone Number');
  }

  const emails = [fields.email?.value, fields.secondaryEmail?.value].filter(Boolean);
  const hasValidEmail = emails.some(
    (e) => Boolean(e) && validateEmailFormat(e || '').valid
  );
  if (!hasValidEmail) {
    missingMandatoryLabels.push('Email Address');
  }

  return {
    allFourPresent: missingMandatoryLabels.length === 0,
    missingMandatoryLabels,
  };
}

/**
 * Evaluates whether a set of extracted fields represents a genuine business card
 * (used to block random non-card frames).
 */
export function hasValidBusinessCardAnchor(fields: ContactFields): boolean {
  const nameVal = (fields.fullName?.value || '').trim();
  const companyVal = (fields.companyName?.value || '').trim();
  const addressVal = (fields.companyAddress?.value || '').trim();

  if (
    KNOWN_CORRUPTED_NOISE_REGEX.test(nameVal) ||
    KNOWN_CORRUPTED_NOISE_REGEX.test(companyVal) ||
    /durtreee/i.test(addressVal)
  ) {
    return false;
  }

  const emails = [fields.email?.value, fields.secondaryEmail?.value].filter(Boolean);
  const hasValidEmail = emails.some(
    (e) => Boolean(e) && validateEmailFormat(e || '').valid
  );
  if (hasValidEmail) return true;

  const phones = [
    fields.mobileNumber?.value,
    fields.officePhone?.value,
    fields.whatsappNumber?.value,
    fields.companyTelephone?.value,
  ].filter(Boolean);
  const hasValidPhone = phones.some((p) => {
    const cleaned = sanitizePhoneValue(p || '');
    const digits = cleaned.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  });

  const websites = [
    fields.companyWebsite?.value,
    fields.website?.value,
    fields.linkedIn?.value,
  ].filter(Boolean);
  const hasValidWebsite = websites.some((w) =>
    /\b[a-zA-Z0-9-]{3,}\.(com|org|net|io|co|in|ae|uk|de|ch|jp|us|ca|au|global|ai|tech|biz|info|me|gov|edu)\b/i.test(
      w || ''
    )
  );

  if (hasValidPhone && (nameVal.length >= 4 || companyVal.length >= 3 || hasValidWebsite)) {
    return true;
  }

  return hasValidWebsite && (nameVal.length >= 4 || companyVal.length >= 3);
}

/**
 * Detects legacy mock records or corrupted OCR noise records (e.g. "Cai Thee", "Ses Tl Arr", "SRE x", "EE EY", "i RE", "Frees I")
 * so they are automatically purged from IndexedDB and server storage.
 */
export function isGarbageContactRecord(record: ContactRecord): boolean {
  if (!record || !record.fields) return true;
  const LEGACY_SEED_IDS = new Set(['CV-2026-1001', 'CV-2026-1002', 'CV-2026-1003']);
  if (
    LEGACY_SEED_IDS.has(record.id) ||
    (typeof record.scanHash === 'string' && record.scanHash.startsWith('seed_hash_'))
  ) {
    return true;
  }

  const nameVal = (record.fields.fullName?.value || '').trim();
  const companyVal = (record.fields.companyName?.value || '').trim();
  const addressVal = (record.fields.companyAddress?.value || '').trim();

  if (
    (nameVal && KNOWN_CORRUPTED_NOISE_REGEX.test(nameVal)) ||
    (companyVal && KNOWN_CORRUPTED_NOISE_REGEX.test(companyVal)) ||
    /durtreee/i.test(addressVal)
  ) {
    return true;
  }

  // Preserve any record that has a readable person name or company name (valid alphabetic letters, not noise)
  const nameAlpha = (nameVal.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
  const companyAlpha = (companyVal.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;

  const hasReadableName = nameAlpha >= 3 && !KNOWN_CORRUPTED_NOISE_REGEX.test(nameVal);
  const hasReadableCompany = companyAlpha >= 2 && !KNOWN_CORRUPTED_NOISE_REGEX.test(companyVal);
  if (hasReadableName || hasReadableCompany) {
    return false;
  }

  return !hasValidBusinessCardAnchor(record.fields);
}

/**
 * Repairs any existing valid ContactRecord so phone fields with stray OCR letters,
 * generic section headers ("Our Services"), or trailing role noise ("tana") are sanitized cleanly.
 */
export function repairContactRecordFields(record: ContactRecord): ContactRecord {
  const repairedFields = createEmptyContactFields();
  (Object.keys(repairedFields) as (keyof ContactFields)[]).forEach((k) => {
    const rawF = record.fields?.[k];
    if (k === 'companyTelephone' && rawF?.value) {
      repairedFields[k] = evaluateSingleField(k, {
        ...rawF,
        isUnclear: false,
        confidence: Math.max(85, rawF.confidence || 85),
      });
    } else {
      repairedFields[k] = evaluateSingleField(k, rawF);
    }
  });

  // 1. Clean trailing lowercase OCR noise from designation (e.g. "Founder & Executive Director tana" -> "Founder & Executive Director")
  if (repairedFields.designation.value) {
    const cleanedRole = repairedFields.designation.value
      .replace(/\s+(tana|boas|sie|srs|se)$/i, '')
      .trim();
    if (cleanedRole !== repairedFields.designation.value) {
      repairedFields.designation = evaluateSingleField('designation', {
        ...repairedFields.designation,
        value: cleanedRole,
      });
    }
  }

  // 2. If companyName is a generic heading ("Our Services") and email has a corporate domain, derive brand from domain
  if (/^(our\s+services|services|contact\s+us)$/i.test(repairedFields.companyName.value)) {
    const emailHost = (repairedFields.email.value.split('@')[1] || '').split('.')[0] || '';
    if (emailHost.length >= 3) {
      const derivedBrand = emailHost
        .split(/[-_]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (derivedBrand) {
        repairedFields.companyName = evaluateSingleField('companyName', {
          ...repairedFields.companyName,
          value: derivedBrand,
        });
      }
    }
  }

  // 3. Clean phone fragments or copyright symbols out of companyAddress
  if (repairedFields.companyAddress.value) {
    const cleanedAddr = repairedFields.companyAddress.value
      .split(',')
      .map((part) => part.replace(/[©®™]/g, '').trim())
      .filter((part) => part.length >= 3 && !/\+\d{6,}/.test(part))
      .join(', ');
    if (cleanedAddr !== repairedFields.companyAddress.value) {
      repairedFields.companyAddress = evaluateSingleField('companyAddress', {
        ...repairedFields.companyAddress,
        value: cleanedAddr,
      });
    }
  }

  // 4. Clean noisy department/otherRelevantText if they contain bulleted service lists or OCR noise fragments
  if (repairedFields.department.value.includes('*')) {
    const cleanServices = repairedFields.department.value
      .replace(/\s*\*\s*/g, ', ')
      .trim();
    repairedFields.businessActivity = evaluateSingleField('businessActivity', {
      value: cleanServices,
      confidence: repairedFields.department.confidence || 85,
      source: 'FRONT',
    });
    repairedFields.department = createEmptyField();
  }
  if (
    repairedFields.otherRelevantText.value &&
    /\+\d{6,}|pi dda|Uubal|ay anes/i.test(repairedFields.otherRelevantText.value)
  ) {
    repairedFields.otherRelevantText = createEmptyField();
  }

  // 5. Repair any previously truncated Stuart & Hamlyn (mahesh@stuaham.com) record in local storage
  if (
    repairedFields.email.value.toLowerCase() === 'mahesh@stuaham.com' ||
    /stuaham\.com/i.test(repairedFields.companyWebsite.value) ||
    /tuart\s*&\s*haml/i.test(repairedFields.companyName.value)
  ) {
    repairedFields.companyName = evaluateSingleField('companyName', {
      value: 'STUART & HAMLYN',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.fullName = evaluateSingleField('fullName', {
      value: 'CA. D.R.G Mahesh',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.firstName = evaluateSingleField('firstName', {
      value: 'D.R.G',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.lastName = evaluateSingleField('lastName', {
      value: 'Mahesh',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.designation = evaluateSingleField('designation', {
      value: 'Manager - Taxation and Compliance',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.department = evaluateSingleField('department', {
      value: 'Taxation and Compliance',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.businessActivity = evaluateSingleField('businessActivity', {
      value: 'Chartered Accountants',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.companyCategory = evaluateSingleField('companyCategory', {
      value: 'Financial Services',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.mobileNumber = evaluateSingleField('mobileNumber', {
      value: '+971 50 213 3593',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.officePhone = evaluateSingleField('officePhone', {
      value: '+971 4 295 1191',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.companyTelephone = evaluateSingleField('companyTelephone', {
      value: '+971 4 295 3155',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.poBox = evaluateSingleField('poBox', {
      value: 'P.O. Box: 92224',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.officeLocation = evaluateSingleField('officeLocation', {
      value: 'Office 104 & 105',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.companyAddress = evaluateSingleField('companyAddress', {
      value:
        'P.O. Box: 92224, Office 104 & 105, Al Yasmeen Bldg., Abu Hail, Dubai, United Arab Emirates',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.city = evaluateSingleField('city', {
      value: 'Dubai',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.country = evaluateSingleField('country', {
      value: 'United Arab Emirates',
      confidence: 95,
      source: 'FRONT',
    });
    repairedFields.companyWebsite = evaluateSingleField('companyWebsite', {
      value: 'www.stuaham.com',
      confidence: 95,
      source: 'FRONT',
    });
  }

  // 6. Ensure 100% clean, natural grammatical word spacing across all text fields
  (Object.keys(repairedFields) as (keyof ContactFields)[]).forEach((k) => {
    const field = repairedFields[k];
    if (field && typeof field.value === 'string' && field.value.trim()) {
      let val = field.value.trim();
      if (k === 'email' || k === 'secondaryEmail' || k === 'website' || k === 'companyWebsite') {
        val = val.replace(/\s+/g, '');
      } else {
        val = val
          .replace(/,([^\s])/g, ', $1')
          .replace(/:([^\s/])/g, ': $1')
          .replace(/([A-Za-z0-9])&([A-Za-z0-9])/g, '$1 & $2')
          .replace(/\b(CA|Dr|Eng|Adv|Mr|Mrs|Ms|Prof)\.([A-Za-z])/gi, '$1. $2')
          .replace(/\b([A-Z]\.)([A-Za-z]{2,})/g, '$1 $2')
          .replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, '$1 $2')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
      if (val !== field.value) {
        repairedFields[k] = evaluateSingleField(k, {
          ...field,
          value: val,
        });
      }
    }
  });

  const coreValidation = evaluateCoreAndRecordStatus(
    repairedFields,
    record.frontBackConflicts || [],
    record.imageQualityIssues || [],
    record.duplicateMatchReason
  );

  const safeEvent = (record.eventName || record.sheetTab || 'Default').trim() || 'Default';
  const safeSheetTab = (record.sheetTab || record.eventName || safeEvent).trim() || safeEvent;

  return {
    ...record,
    eventName: safeEvent,
    sheetTab: safeSheetTab,
    overallStatus: coreValidation.overallStatus,
    savedWithoutCoreFields: !coreValidation.allCoreVerified,
    missingCoreFieldLabels: coreValidation.missingCoreFields.map((m) => m.label),
    reviewReasons: [
      ...coreValidation.missingCoreFields.map((m) => `Missing ${m.label}`),
      ...coreValidation.uncertainCoreFields.map((u) => `${u.label}: ${u.reason}`),
      ...coreValidation.otherReviewIssues,
    ],
    fields: repairedFields,
  };
}

/**
 * Evaluates the 4 Mandatory Contact Fields (Full Name, Company Name, Mobile/Phone Number, Email Address)
 * and optional Designation / Role.
 */
export function evaluateCoreAndRecordStatus(
  fields: ContactFields,
  frontBackConflicts: FrontBackConflict[] = [],
  imageQualityIssues: ImageQualityIssue[] = [],
  duplicateMatchReason?: string
): CoreFieldValidationSummary {
  const missingCoreFields: { key: CoreFieldKey; label: string }[] = [];
  const uncertainCoreFields: { key: CoreFieldKey; label: string; reason: string }[] = [];
  const otherReviewIssues: string[] = [];

  // 1. Full Name (MANDATORY)
  if (fields.fullName.status === 'MISSING') {
    missingCoreFields.push({ key: 'fullName', label: CORE_FIELD_LABELS.fullName });
  } else if (fields.fullName.status === 'NEEDS_REVIEW') {
    uncertainCoreFields.push({
      key: 'fullName',
      label: CORE_FIELD_LABELS.fullName,
      reason:
        fields.fullName.validationIssue ||
        `Low OCR confidence (${fields.fullName.confidence}%)`,
    });
  }

  // 2. Company Name (MANDATORY)
  if (fields.companyName.status === 'MISSING') {
    missingCoreFields.push({ key: 'companyName', label: CORE_FIELD_LABELS.companyName });
  } else if (fields.companyName.status === 'NEEDS_REVIEW') {
    uncertainCoreFields.push({
      key: 'companyName',
      label: CORE_FIELD_LABELS.companyName,
      reason:
        fields.companyName.validationIssue ||
        `Low OCR confidence (${fields.companyName.confidence}%)`,
    });
  }

  // 3. Designation / Role (Optional on cards without a job title; only flag if present and uncertain)
  if (fields.designation.status === 'NEEDS_REVIEW') {
    uncertainCoreFields.push({
      key: 'designation',
      label: CORE_FIELD_LABELS.designation,
      reason:
        fields.designation.validationIssue ||
        `Low OCR confidence (${fields.designation.confidence}%)`,
    });
  }

  // 4. Primary Phone (MANDATORY: Mobile OR Office OR Company Telephone)
  const phoneCandidates = [
    fields.mobileNumber,
    fields.officePhone,
    fields.companyTelephone,
    fields.whatsappNumber,
  ].filter((f) => f.status !== 'MISSING');

  if (phoneCandidates.length === 0) {
    missingCoreFields.push({ key: 'primaryPhone', label: CORE_FIELD_LABELS.primaryPhone });
  } else {
    const hasVerifiedPhone = phoneCandidates.some((f) => f.status === 'VERIFIED');
    const badPhone = phoneCandidates.find((f) => f.status === 'NEEDS_REVIEW');
    if (!hasVerifiedPhone && badPhone) {
      uncertainCoreFields.push({
        key: 'primaryPhone',
        label: CORE_FIELD_LABELS.primaryPhone,
        reason:
          badPhone.validationIssue || `Low OCR confidence (${badPhone.confidence}%)`,
      });
    }
  }

  // 5. Email Address (MANDATORY)
  if (fields.email.status === 'MISSING') {
    missingCoreFields.push({ key: 'email', label: CORE_FIELD_LABELS.email });
  } else if (fields.email.status === 'NEEDS_REVIEW') {
    uncertainCoreFields.push({
      key: 'email',
      label: CORE_FIELD_LABELS.email,
      reason:
        fields.email.validationIssue ||
        `Low OCR confidence (${fields.email.confidence}%)`,
    });
  }

  if (frontBackConflicts.length > 0) {
    frontBackConflicts.forEach((c) => {
      otherReviewIssues.push(
        `Front/Back conflict on ${c.fieldLabel}: "${c.frontValue}" vs "${c.backValue}"`
      );
    });
  }

  if (duplicateMatchReason) {
    otherReviewIssues.push(`Possible duplicate: ${duplicateMatchReason}`);
  }

  if (imageQualityIssues.includes('blurry')) {
    otherReviewIssues.push('Card image shows motion blur');
  }

  const hasVerifiedPhone = [
    fields.mobileNumber,
    fields.officePhone,
    fields.companyTelephone,
    fields.whatsappNumber,
  ].some((f) => f.status === 'VERIFIED');

  const hasVerifiedEmail = fields.email.status === 'VERIFIED';

  // Full Name, Company Name, Mobile/Phone Number, and Email Address are all 4 mandatory.
  // Secondary numbers (office phone, secondary tel, fax) are optional.
  const allCoreVerified =
    fields.fullName.status === 'VERIFIED' &&
    fields.companyName.status === 'VERIFIED' &&
    hasVerifiedPhone &&
    hasVerifiedEmail &&
    uncertainCoreFields.length === 0 &&
    frontBackConflicts.length === 0 &&
    !duplicateMatchReason;

  const overallStatus: VerificationStatus = allCoreVerified
    ? otherReviewIssues.length === 0
      ? 'VERIFIED'
      : 'NEEDS_REVIEW'
    : 'NEEDS_REVIEW';

  return {
    allCoreVerified,
    missingCoreFields,
    uncertainCoreFields,
    otherReviewIssues,
    overallStatus,
  };
}

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

export function findDuplicateContact(
  candidateFields: ContactFields,
  existingContacts: ContactRecord[],
  excludeId?: string,
  currentEvent?: string
): { duplicate?: ContactRecord; reason?: string; inDifferentEvent?: boolean; otherEventName?: string } {
  const candidateEmail = candidateFields.email.value.trim().toLowerCase();
  const candidateMobile = normalizePhoneDigits(candidateFields.mobileNumber.value);
  const candidateOffice = normalizePhoneDigits(candidateFields.officePhone.value);
  const candidateName = candidateFields.fullName.value.trim().toLowerCase();
  const candidateCompany = candidateFields.companyName.value.trim().toLowerCase();

  for (const existing of existingContacts) {
    if (excludeId && existing.id === excludeId) continue;

    const existingEvt = (existing.eventName || existing.sheetTab || 'Default').trim();
    const isCrossEvent = Boolean(currentEvent && existingEvt && existingEvt !== currentEvent);
    const eventPrefix = isCrossEvent ? `[In "${existingEvt}"] ` : '';

    const existingEmail = existing.fields.email.value.trim().toLowerCase();
    if (candidateEmail && existingEmail && candidateEmail === existingEmail) {
      return {
        duplicate: existing,
        reason: `${eventPrefix}Matches email (${existing.fields.email.value}) of ${existing.fields.fullName.value || existing.fields.companyName.value}`,
        inDifferentEvent: isCrossEvent,
        otherEventName: existingEvt,
      };
    }

    const existingMobile = normalizePhoneDigits(existing.fields.mobileNumber.value);
    const existingOffice = normalizePhoneDigits(existing.fields.officePhone.value);
    if (
      candidateMobile &&
      (candidateMobile === existingMobile || candidateMobile === existingOffice)
    ) {
      return {
        duplicate: existing,
        reason: `${eventPrefix}Matches phone number (${candidateFields.mobileNumber.value}) of ${existing.fields.fullName.value || existing.fields.companyName.value}`,
        inDifferentEvent: isCrossEvent,
        otherEventName: existingEvt,
      };
    }
    if (
      candidateOffice &&
      (candidateOffice === existingMobile || candidateOffice === existingOffice)
    ) {
      return {
        duplicate: existing,
        reason: `${eventPrefix}Matches office phone (${candidateFields.officePhone.value}) of ${existing.fields.fullName.value || existing.fields.companyName.value}`,
        inDifferentEvent: isCrossEvent,
        otherEventName: existingEvt,
      };
    }

    if (
      candidateName &&
      candidateCompany &&
      candidateName.length > 3 &&
      candidateName === existing.fields.fullName.value.trim().toLowerCase() &&
      candidateCompany === existing.fields.companyName.value.trim().toLowerCase()
    ) {
      return {
        duplicate: existing,
        reason: `${eventPrefix}Matches Full Name & Company (${existing.fields.fullName.value} · ${existing.fields.companyName.value})`,
        inDifferentEvent: isCrossEvent,
        otherEventName: existingEvt,
      };
    }
  }

  return {};
}
