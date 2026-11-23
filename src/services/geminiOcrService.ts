import { GoogleGenAI, Type } from '@google/genai';
import {
  type ContactFields,
  type ExtractedField,
  type FieldSource,
  type ImageQualityIssue,
  INDUSTRY_CATEGORIES,
} from '../types/card.ts';
import {
  createEmptyContactFields,
  evaluateSingleField,
  sanitizePhoneValue,
} from '../utils/cardValidator.ts';

export interface GeminiCardExtractionResult {
  isUnreadable: boolean;
  unreadableReason?: string;
  isLogoOrBlankSideOnly: boolean;
  backSideHadNoExtraData: boolean;
  rawOcrFront: string;
  rawOcrBack?: string;
  cardOrientation: 'horizontal' | 'vertical';
  imageQualityIssues: ImageQualityIssue[];
  fields: ContactFields;
  allContacts: {
    fields: ContactFields;
    customFields: any[];
  }[];
  confidence: number;
}

const GEMINI_BUSINESS_CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isBusinessCard: {
      type: Type.BOOLEAN,
      description: 'True if the image contains a business card, visiting card, or corporate contact info.',
    },
    isUnreadable: {
      type: Type.BOOLEAN,
      description: 'True only if the card text is completely illegible or missing.',
    },
    unreadableReason: {
      type: Type.STRING,
      description: 'Reason if unreadable, otherwise empty.',
    },
    cardOrientation: {
      type: Type.STRING,
      enum: ['horizontal', 'vertical'],
      description: 'Visual orientation of the card layout.',
    },
    imageQualityIssues: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        enum: [
          'low_light',
          'glare',
          'blurry',
          'tilted',
          'small_text',
          'complex_background',
          'damaged_or_faded',
        ],
      },
    },
    rawTextFront: {
      type: Type.STRING,
      description: 'Verbatim transcription of all text on the front side of the card.',
    },
    rawTextBack: {
      type: Type.STRING,
      description: 'Verbatim transcription of all text on the back side (if provided).',
    },
    primaryContact: {
      type: Type.OBJECT,
      description: 'Main contact person and company details extracted from the card.',
      properties: {
        fullName: { type: Type.STRING, description: 'Full name with honorific/prefix (e.g. CA. D.R.G Mahesh, Dr. Jane Doe, John Smith)' },
        firstName: { type: Type.STRING, description: 'Given name' },
        lastName: { type: Type.STRING, description: 'Family/surname' },
        designation: { type: Type.STRING, description: 'Job title or role (e.g. Manager - Taxation and Compliance, Senior Partner, Founder & CEO)' },
        department: { type: Type.STRING, description: 'Department or division if specified (e.g. Tax & Audit, Marketing, Engineering)' },
        mobileNumber: { type: Type.STRING, description: 'Direct mobile or cell number, including international country code (e.g. +971 50 213 3593)' },
        officePhone: { type: Type.STRING, description: 'Office direct phone or main landline 1 (e.g. +971 4 295 1191)' },
        companyTelephone: { type: Type.STRING, description: 'Secondary company telephone or main board line 2 if present (e.g. +971 4 295 3155)' },
        whatsappNumber: { type: Type.STRING, description: 'WhatsApp number if explicitly labeled or same as mobile' },
        faxNumber: { type: Type.STRING, description: 'Fax number if labeled (e.g. +971 4 396 5025)' },
        email: { type: Type.STRING, description: 'Primary email address (e.g. mahesh@stuaham.com)' },
        secondaryEmail: { type: Type.STRING, description: 'Alternate or general email (e.g. info@company.com)' },
        companyWebsite: { type: Type.STRING, description: 'Official company website (e.g. www.stuaham.com)' },
        website: { type: Type.STRING, description: 'Personal or portfolio website if distinct' },
        linkedIn: { type: Type.STRING, description: 'LinkedIn URL or handle if listed' },
        otherSocialMedia: { type: Type.STRING, description: 'Twitter, Instagram, YouTube or other handles' },
        companyName: { type: Type.STRING, description: 'Full legal or brand company name (e.g. STUART & HAMLYN, DAR ALNUZUM)' },
        companyCategory: {
          type: Type.STRING,
          description: 'Industry category matching or similar to standard categories (e.g. Financial Services, Consulting, Real Estate, Healthcare, Information Technology)',
        },
        businessActivity: { type: Type.STRING, description: 'Core business description printed on card (e.g. Chartered Accountants, Public Accountants)' },
        companyAddress: { type: Type.STRING, description: 'Full street / building / area address printed on the card' },
        officeLocation: { type: Type.STRING, description: 'Suite, floor, office number (e.g. Office 104 & 105, Al Yasmeen Bldg)' },
        city: { type: Type.STRING, description: 'City (e.g. Dubai, Abu Dhabi, New York, London)' },
        country: { type: Type.STRING, description: 'Country (e.g. United Arab Emirates, India, United States)' },
        poBox: { type: Type.STRING, description: 'P.O. Box number only without prefix (e.g. 92224)' },
        registrationInfo: { type: Type.STRING, description: 'TRN, VAT number, commercial registration, license number if present' },
        qrCodeInfo: { type: Type.STRING, description: 'Any QR code URL or notes printed near the QR' },
        otherRelevantText: { type: Type.STRING, description: 'Professional degrees or qualifications (e.g. FCA, CPA, ACCA, PhD, PMP)' },
      },
    },
    additionalContacts: {
      type: Type.ARRAY,
      description: 'Any other people listed on the same card (e.g., co-founders, partners, assistants).',
      items: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING },
          designation: { type: Type.STRING },
          mobileNumber: { type: Type.STRING },
          officePhone: { type: Type.STRING },
          email: { type: Type.STRING },
        },
      },
    },
  },
  required: ['isBusinessCard', 'isUnreadable', 'rawTextFront', 'primaryContact'],
};

export async function extractWithGeminiVision(
  frontBase64: string,
  backBase64: string | undefined,
  apiKey: string,
  preferredModel?: string,
  localOcrHint?: string
): Promise<GeminiCardExtractionResult> {
  const cleanFront = frontBase64.replace(/^data:image\/\w+;base64,/, '');
  const cleanBack = backBase64 ? backBase64.replace(/^data:image\/\w+;base64,/, '') : undefined;

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });

  const systemInstruction = `You are the World's Premier Optical Character Recognition and Business Card Information Extraction Engine.
Your objective is 100% precision transcription and structured semantic extraction of business/visiting cards.
Guidelines:
1. Accurately transcribe every single character, letter, symbol, phone digit, country code, email, website, and address with perfect natural word spacing.
   Never concatenate or drop spaces between words or around symbols (e.g. always transcribe as "STUART & HAMLYN" not "STUART&HAMLYN", "CA. D.R.G. MAHESH" not "CA.D.R.G MAHESH", "MUHAMMAD LARIK" not "MUHAMMADLARIK", "CHIEF COMPLIANCE OFFICER" not "CHIEFCOMPLIANCEOFFICER", "United Arab Emirates" not "UnitedArabEmirates", "Al Yasmeen Bldg., Abu Hail" not "Al Yasmeen Bldg.,AbuHail").
   Ensure clean single spaces between words, proper spaces after punctuation (commas, periods, colons), and standardized phone spacing (e.g. "+971 50 213 3593").
   Email addresses and URLs must have zero interior whitespace (e.g. "mahesh@stuaham.com", "www.stuaham.com").
2. Distinguish correctly between:
   - Mobile numbers (often tagged M, Mob, Cell, GSM, +971 50..., +1 ..., etc.)
   - Landlines / Office telephones (often tagged T, Tel, Tel 1, Tel 2, O, Office, Board)
   - Fax numbers (tagged F, Fax)
   - WhatsApp numbers (tagged WA, WhatsApp)
3. Do NOT invent or hallucinate data. If a field is not printed on the card, return an empty string "".
   Never invent names or split details when a card has multiple numbers. Multiple phone numbers (e.g. mobile + landline) belong to the primaryContact (mobileNumber, officePhone, companyTelephone, whatsappNumber).
   Do NOT create additionalContacts unless the card explicitly prints two distinct, named human individuals with their own respective personal names and job titles. Do NOT treat multiple phone numbers, company names, slogans, departments, or addresses as additional contacts.
4. If professional prefixes/titles are present (e.g., "CA.", "Dr.", "Eng.", "Adv.", "Prof.", "CPA", "FCA"), retain them in fullName or otherRelevantText appropriately.
5. In multi-column cards, ensure text from left columns (e.g., company name, logo slogans) is not conflated with right columns (e.g., personal name, job titles).
6. Infer companyCategory accurately from the business activity, company name, or services listed (e.g. "Chartered Accountants" -> "Financial Services").
7. Ensure email addresses and websites are clean, lowercase where standard, and without trailing punctuation. Correct obvious OCR domain typos like ".cem" -> ".com".
8. If the card contains text in both English and Arabic/international script, transcribe all relevant contact details.`;

  const contents: any[] = [];

  // Front image
  contents.push({
    inlineData: {
      data: cleanFront,
      mimeType: 'image/jpeg',
    },
  });

  // Optional back image
  if (cleanBack) {
    contents.push({
      inlineData: {
        data: cleanBack,
        mimeType: 'image/jpeg',
      },
    });
    contents.push(
      localOcrHint
        ? `Attached are the FRONT and BACK images of the business card.\nPreliminary local OCR detected text:\n"""\n${localOcrHint}\n"""\nAudit the visual images carefully: fix missing spaces, fix any OCR misspellings, and extract all genuine contact details. Do NOT invent or hallucinate any data.`
        : 'Attached are the FRONT and BACK images of the business card. Extract all contact and company details with 100% precision.'
    );
  } else {
    contents.push(
      localOcrHint
        ? `Attached is the business card image.\nPreliminary local OCR detected text:\n"""\n${localOcrHint}\n"""\nAudit the visual image carefully: fix missing spaces, fix any OCR misspellings (e.g. .cem -> .com), and extract all genuine contact details. Do NOT invent or hallucinate any data.`
        : 'Attached is the business card image. Extract all contact and company details with 100% precision.'
    );
  }

  // Attempt preferred model first with automatic resilient fallbacks (fast sub-1.5s models prioritized)
  const defaultModels = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
  ];
  const modelsToTry = preferredModel
    ? [preferredModel, ...defaultModels.filter((m) => m !== preferredModel)]
    : defaultModels;
  let lastError: any = null;
  let parsedJson: any = null;

  for (const modelName of modelsToTry) {
    // Attempt model with fast retry for momentary 503 high-demand spikes
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: GEMINI_BUSINESS_CARD_SCHEMA as any,
              temperature: 0.1, // Near-zero temperature for maximum deterministic OCR precision
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout: Gemini ${modelName} exceeded 8s`)), 8000)
          ),
        ]);

        const responseText = response.text?.trim() || '';
        if (responseText) {
          parsedJson = JSON.parse(responseText);
          break;
        }
      } catch (err: any) {
        lastError = err;
        const isUnavailable = err?.message?.includes('503') || err?.message?.includes('high demand') || err?.message?.includes('UNAVAILABLE');
        if (isUnavailable && attempt === 0) {
          console.warn(`[Gemini] ${modelName} momentary 503 spike, retrying in 750ms...`);
          await new Promise((r) => setTimeout(r, 750));
          continue;
        }
        console.warn(`Gemini model ${modelName} failed, trying next fallback:`, err?.message || err);
        // If quota is exhausted on this API key, do not burn more time on sibling models
        if (err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('429')) {
          break;
        }
        break;
      }
    }
    if (parsedJson) break;
  }

  if (!parsedJson) {
    throw new Error(
      lastError?.message || 'Failed to extract business card data using Gemini Vision.'
    );
  }

  const p = parsedJson.primaryContact || {};
  const fields = createEmptyContactFields();

  const normalizeFieldSpaces = (val: string, key: keyof ContactFields): string => {
    if (!val) return '';
    let s = val.trim();
    if (key === 'email' || key === 'secondaryEmail' || key === 'website' || key === 'companyWebsite') {
      return s.replace(/\s+/g, '');
    }
    // Ensure space after punctuation (commas, colons, periods after titles)
    s = s.replace(/,([^\s])/g, ', $1');
    s = s.replace(/:([^\s/])/g, ': $1');
    s = s.replace(/([A-Za-z0-9])&([A-Za-z0-9])/g, '$1 & $2');
    s = s.replace(/\b(CA|Dr|Eng|Adv|Mr|Mrs|Ms|Prof)\.([A-Za-z])/gi, '$1. $2');
    s = s.replace(/\b([A-Z]\.)([A-Za-z]{2,})/g, '$1 $2');
    s = s.replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, '$1 $2');
    s = s.replace(/\s{2,}/g, ' ');
    return s.trim();
  };

  const setField = (key: keyof ContactFields, val: string | undefined, source: FieldSource = 'FRONT') => {
    const rawVal = normalizeFieldSpaces(val || '', key);
    if (rawVal) {
      fields[key] = evaluateSingleField(key, {
        value: rawVal,
        confidence: 98,
        source,
        status: 'VERIFIED',
      });
    }
  };

  setField('fullName', p.fullName);
  setField('firstName', p.firstName);
  setField('lastName', p.lastName);
  setField('designation', p.designation);
  setField('department', p.department);
  setField('mobileNumber', p.mobileNumber);
  setField('officePhone', p.officePhone);
  setField('companyTelephone', p.companyTelephone);
  setField('whatsappNumber', p.whatsappNumber);
  setField('faxNumber', p.faxNumber);
  setField('email', p.email);
  setField('secondaryEmail', p.secondaryEmail);
  setField('companyWebsite', p.companyWebsite);
  setField('website', p.website || p.companyWebsite);
  setField('linkedIn', p.linkedIn);
  setField('otherSocialMedia', p.otherSocialMedia);
  setField('companyName', p.companyName);
  setField('companyCategory', p.companyCategory);
  setField('businessActivity', p.businessActivity);
  setField('companyAddress', p.companyAddress);
  setField('officeLocation', p.officeLocation);
  setField('city', p.city);
  setField('country', p.country);
  setField('poBox', p.poBox);
  setField('registrationInfo', p.registrationInfo);
  setField('qrCodeInfo', p.qrCodeInfo);
  setField('otherRelevantText', p.otherRelevantText);

  // If firstName/lastName were empty but fullName was found, split appropriately
  if (fields.fullName.value && !fields.firstName.value) {
    const nameParts = fields.fullName.value.replace(/^(ca|dr|eng|mr|mrs|ms|adv)\.?\s+/i, '').split(/\s+/);
    if (nameParts.length > 0) {
      fields.firstName = evaluateSingleField('firstName', {
        value: nameParts[0],
        confidence: 95,
        source: 'FRONT',
        status: 'VERIFIED',
      });
      if (nameParts.length > 1) {
        fields.lastName = evaluateSingleField('lastName', {
          value: nameParts.slice(1).join(' '),
          confidence: 95,
          source: 'FRONT',
          status: 'VERIFIED',
        });
      }
    }
  }

  const allContacts: { fields: ContactFields; customFields: any[] }[] = [
    {
      fields,
      customFields: [],
    },
  ];

  // If there are additional contacts on the same card, construct records for them
  if (Array.isArray(parsedJson.additionalContacts) && parsedJson.additionalContacts.length > 0) {
    for (const add of parsedJson.additionalContacts) {
      if (add.fullName && add.fullName.trim()) {
        const addFields = createEmptyContactFields();
        // Copy over shared company info
        addFields.companyName = { ...fields.companyName };
        addFields.companyWebsite = { ...fields.companyWebsite };
        addFields.companyAddress = { ...fields.companyAddress };
        addFields.city = { ...fields.city };
        addFields.country = { ...fields.country };
        addFields.poBox = { ...fields.poBox };
        addFields.companyTelephone = { ...fields.companyTelephone };
        addFields.companyCategory = { ...fields.companyCategory };
        addFields.businessActivity = { ...fields.businessActivity };

        // Specific contact fields
        addFields.fullName = evaluateSingleField('fullName', {
          value: add.fullName,
          confidence: 96,
          source: 'FRONT',
          status: 'VERIFIED',
        });
        if (add.designation) {
          addFields.designation = evaluateSingleField('designation', {
            value: add.designation,
            confidence: 96,
            source: 'FRONT',
            status: 'VERIFIED',
          });
        }
        if (add.mobileNumber) {
          addFields.mobileNumber = evaluateSingleField('mobileNumber', {
            value: sanitizePhoneValue(add.mobileNumber),
            confidence: 96,
            source: 'FRONT',
            status: 'VERIFIED',
          });
        }
        if (add.officePhone) {
          addFields.officePhone = evaluateSingleField('officePhone', {
            value: sanitizePhoneValue(add.officePhone),
            confidence: 96,
            source: 'FRONT',
            status: 'VERIFIED',
          });
        }
        if (add.email) {
          addFields.email = evaluateSingleField('email', {
            value: add.email,
            confidence: 96,
            source: 'FRONT',
            status: 'VERIFIED',
          });
        }

        allContacts.push({
          fields: addFields,
          customFields: [],
        });
      }
    }
  }

  return {
    isUnreadable: Boolean(parsedJson.isUnreadable),
    unreadableReason: parsedJson.unreadableReason || undefined,
    isLogoOrBlankSideOnly: !parsedJson.isBusinessCard,
    backSideHadNoExtraData: !Boolean(cleanBack),
    rawOcrFront: parsedJson.rawTextFront || '',
    rawOcrBack: parsedJson.rawTextBack || undefined,
    cardOrientation: parsedJson.cardOrientation === 'vertical' ? 'vertical' : 'horizontal',
    imageQualityIssues: parsedJson.imageQualityIssues || [],
    fields,
    allContacts,
    confidence: 99,
  };
}
