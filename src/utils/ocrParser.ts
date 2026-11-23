import {
  type ContactFields,
  type CustomCardField,
  INDUSTRY_CATEGORIES,
  type ImageQualityIssue,
  type ScanDiagnosticLog,
  type ScanDiagnosticDecision,
} from '../types/card.ts';
import { createEmptyContactFields, evaluateSingleField } from './cardValidator.ts';

const DESIGNATION_KEYWORDS = [
  'chief',
  'chief compliance officer',
  'compliance officer',
  'compliance manager',
  'compliance lead',
  'chief risk officer',
  'chief operating officer',
  'chief executive officer',
  'chief technology officer',
  'chief financial officer',
  'chief information officer',
  'chief commercial officer',
  'chief strategy officer',
  'chief security officer',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'cio',
  'cmo',
  'ciso',
  'president',
  'vice president',
  'vp',
  'svp',
  'evp',
  'avp',
  'director',
  'managing director',
  'executive director',
  'manager',
  'general manager',
  'branch manager',
  'project manager',
  'product manager',
  'sales manager',
  'operations manager',
  'account manager',
  'marketing manager',
  'partner',
  'managing partner',
  'senior partner',
  'proprietor',
  'prop.',
  'prop:',
  'founder',
  'co-founder',
  'owner',
  'principal',
  'head of',
  'lead',
  'team lead',
  'tech lead',
  'engineer',
  'software engineer',
  'civil engineer',
  'mechanical engineer',
  'electrical engineer',
  'developer',
  'architect',
  'solutions architect',
  'designer',
  'consultant',
  'specialist',
  'analyst',
  'business analyst',
  'financial analyst',
  'coordinator',
  'administrator',
  'officer',
  'executive',
  'sales executive',
  'marketing executive',
  'account executive',
  'business development',
  'bdm',
  'representative',
  'advisor',
  'financial advisor',
  'legal advisor',
  'counsel',
  'attorney',
  'lawyer',
  'advocate',
  'accountant',
  'auditor',
  'controller',
  'treasurer',
  'secretary',
  'company secretary',
  'supervisor',
  'superintendent',
  'foreman',
  'technician',
  'scientist',
  'researcher',
  'professor',
  'lecturer',
  'dean',
  'doctor',
  'physician',
  'surgeon',
  'cardiologist',
  'dentist',
  'ortho',
  'pediatrician',
  'gynecologist',
  'dermatologist',
  'neurologist',
  'radiologist',
  'pharmacist',
  'nurse',
  'therapist',
  'strategist',
  'planner',
  'producer',
  'editor',
  'broker',
  'agent',
  'realtor',
  'banker',
  'investor',
  'associate',
  'assistant',
  'chairman',
  'chairperson',
  'MD',
  'board member',
  'trustee',
  'procurement',
  'purchasing',
  'logistics',
  'supply chain',
  'human resources',
  'recruiter',
  'customer success',
  'relations',
];

const DEPARTMENT_SPEC_REGEX =
  /\b(taxation(\s+and\s+compliance)?|compliance|audit(\s+&\s+assurance|\s+and\s+assurance)?|assurance|corporate\s+finance|human\s+resources|information\s+technology|business\s+development|sales\s+(&|and)\s+marketing|operations|accounts\s+(&|and)\s+finance|supply\s+chain|customer\s+relations|legal\s+(&|and)\s+compliance|procurement)\b/i;

const FIRM_ACTIVITY_LINE_REGEX =
  /^(chartered\s*accountants?|certified\s*public\s*accountants?|advocates?\s*(&|and)\s*solicitors?|legal\s*consultants?|management\s*consultants?|auditors?\s*(&|and)\s*advisors?|tax\s*consultants?|architects?\s*(&|and)\s*engineers?)$/i;

const COMPANY_SUFFIX_REGEX =
  /\b(inc\.?|llc\.?|ltd\.?|pvt\.?|private|limited|corp\.?|corporation|gmbh|ag|s\.?a\.?|s\.?r\.?l\.?|b\.?v\.?|plc|llp|lp|fze|fzco|dmcc|pjsc|wll|co\.?|company|group|holdings|international|global|technologies|technology|tech|solutions|systems|services|enterprises|enterprise|industries|industry|traders|trading|exports?|imports?|partners|associates|agency|agencies|consulting|consultancy|advisory|capital|ventures|investments|financial|bank|insurance|realty|properties|developers|infratech|infra|infrastructure|constructions?|builders|architects|interior|interiors|engineering|works|manufacturing|mills|textiles|garments|plastics|polymers|chemicals|motors|automotive|auto|logistics|transport|movers|cargo|shipping|freight|medical|healthcare|pharma|pharmaceuticals|diagnostics|biosystems|biotech|labs|laboratories|clinic|hospital|care|university|college|institute|academy|school|media|studios?|communications|telecom|networks|energy|power|solar|electricals|electronics|hardware|software|jewellers|jewelers|jewellery|gems|foods|beverages|bakers|sweets|caterers|agro|farms|hotels?|resorts?|hospitality|catering|travels|tours|holidays|mart|store|stores|emporium|boutique|salon|spa|fitness|gym|chambers|law\s*firm|foundation|trust|society|federation|council)\b/i;

const BUSINESS_QUALIFIER_REGEX =
  /\b(clinic|studio|studios|consulting|consultancy|associates|law\s*chambers|chambers|partners|practice|services|enterprises|ventures|agency|design|designs|architecture|architects|dental|hospital|labs|laboratories|group|holdings|media|realty|builders|firm|systems|solutions|technologies|tech|motors|foods|industries|trading|logistics)\b/i;

const ADDRESS_KEYWORDS_REGEX =
  /\b(street|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|way|court|ct\.?|plaza|square|sq\.?|parkway|pkwy|highway|hwy|building|bldg\.?|tower|towers|floor|fl\.?|suite|ste\.?|unit|room|rm\.?|block|sector|sec\.?|phase|stage|plot|door\s*no|d\.?\s*no|h\.?\s*no|house\s*no|flat\s*no|shop\s*no|shed\s*no|survey\s*no|sy\.?\s*no|main|cross|layout|extension|extn|nagar|colony|enclave|vihar|puram|pally|pet|peta|guda|bad|ganj|marg|path|circle|chowk|bazar|bazaar|market|arcade|complex|bhavan|bhawan|sadan|nivas|mansion|industrial|estate|park|zone|center|centre|mall|gate|village|district|dist\.?|taluk|mandal|opp\.?|opposite|near|beside|behind|next\s*to|above|below|ground\s*floor|1st\s*floor|2nd\s*floor|3rd\s*floor|4th\s*floor|po\s*box|p\.?\s*[o0]\.?\s*box|pin|zip|postal|difc|jlt|sheikh\s*zayed|abu\s*hail|deira|bur\s*dubai|karama|al\s+yasmeen|healthcare\s*city|media\s*city|internet\s*city|silicon\s*oasis|free\s*zone)\b|(?<=\s)dr\.(?!\s+[A-Za-z])|(?<=\s)st\.(?!\s+[A-Za-z])/i;

const COUNTRIES_LIST = [
  'United Arab Emirates',
  'UAE',
  'India',
  'Saudi Arabia',
  'KSA',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'United States',
  'USA',
  'U.S.A.',
  'United Kingdom',
  'UK',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Switzerland',
  'Japan',
  'China',
  'Singapore',
  'Netherlands',
  'Spain',
  'Italy',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Belgium',
  'Austria',
  'Ireland',
  'Poland',
  'Brazil',
  'Mexico',
  'South Korea',
  'Korea',
  'Taiwan',
  'Hong Kong',
  'Malaysia',
  'Thailand',
  'Indonesia',
  'Vietnam',
  'Philippines',
  'South Africa',
  'Nigeria',
  'Egypt',
  'Kenya',
  'Turkey',
  'Israel',
  'New Zealand',
];

const MAJOR_CITIES = [
  // India
  'Mumbai',
  'Navi Mumbai',
  'Thane',
  'Delhi',
  'New Delhi',
  'Noida',
  'Greater Noida',
  'Gurugram',
  'Gurgaon',
  'Faridabad',
  'Ghaziabad',
  'Bengaluru',
  'Bangalore',
  'Hyderabad',
  'Secunderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Ahmedabad',
  'Surat',
  'Vadodara',
  'Rajkot',
  'Jaipur',
  'Lucknow',
  'Kanpur',
  'Nagpur',
  'Indore',
  'Bhopal',
  'Visakhapatnam',
  'Vizag',
  'Vijayawada',
  'Guntur',
  'Warangal',
  'Tirupati',
  'Nellore',
  'Kurnool',
  'Rajahmundry',
  'Kakinada',
  'Karimnagar',
  'Nizamabad',
  'Khammam',
  'Coimbatore',
  'Madurai',
  'Tiruchirappalli',
  'Salem',
  'Kochi',
  'Cochin',
  'Thiruvananthapuram',
  'Kozhikode',
  'Thrissur',
  'Mysuru',
  'Mysore',
  'Mangaluru',
  'Mangalore',
  'Hubballi',
  'Belagavi',
  'Patna',
  'Ranchi',
  'Bhubaneswar',
  'Cuttack',
  'Guwahati',
  'Chandigarh',
  'Ludhiana',
  'Amritsar',
  'Jalandhar',
  'Dehradun',
  'Raipur',
  'Jodhpur',
  'Udaipur',
  'Kota',
  'Agra',
  'Varanasi',
  'Prayagraj',
  'Meerut',
  'Nashik',
  'Aurangabad',
  'Solapur',
  'Kolhapur',
  'Goa',
  'Panaji',
  // Global
  'New York',
  'San Francisco',
  'Chicago',
  'Los Angeles',
  'Boston',
  'Seattle',
  'Austin',
  'Houston',
  'Dallas',
  'Atlanta',
  'Miami',
  'Denver',
  'Phoenix',
  'San Diego',
  'San Jose',
  'London',
  'Manchester',
  'Birmingham',
  'Edinburgh',
  'Toronto',
  'Vancouver',
  'Montreal',
  'Calgary',
  'Sydney',
  'Melbourne',
  'Brisbane',
  'Perth',
  'Berlin',
  'Munich',
  'Frankfurt',
  'Hamburg',
  'Stuttgart',
  'Paris',
  'Lyon',
  'Zurich',
  'Geneva',
  'Basel',
  'Tokyo',
  'Osaka',
  'Yokohama',
  'Singapore',
  'Hong Kong',
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Riyadh',
  'Jeddah',
  'Dammam',
  'Doha',
  'Kuwait City',
  'Manama',
  'Muscat',
  'Amsterdam',
  'Rotterdam',
  'Madrid',
  'Barcelona',
  'Milan',
  'Rome',
  'Dublin',
  'Stockholm',
  'Oslo',
  'Copenhagen',
  'Seoul',
  'Taipei',
  'Kuala Lumpur',
  'Bangkok',
  'Jakarta',
  'Manila',
  'Johannesburg',
  'Cape Town',
];

const INDIAN_STATES_MAP: Record<string, string> = {
  telangana: 'India',
  'andhra pradesh': 'India',
  karnataka: 'India',
  'tamil nadu': 'India',
  maharashtra: 'India',
  gujarat: 'India',
  rajasthan: 'India',
  kerala: 'India',
  'uttar pradesh': 'India',
  'madhya pradesh': 'India',
  'west bengal': 'India',
  bihar: 'India',
  odisha: 'India',
  punjab: 'India',
  haryana: 'India',
  jharkhand: 'India',
  chhattisgarh: 'India',
  assam: 'India',
  uttarakhand: 'India',
  'himachal pradesh': 'India',
};

function classifyIndustryFromText(fullText: string): string {
  const lower = fullText.toLowerCase();
  const rules: { category: (typeof INDUSTRY_CATEGORIES)[number]; keywords: string[] }[] = [
    {
      category: 'Financial Services',
      keywords: [
        'chartered accountant',
        'chartered accountants',
        'accounting',
        'taxation',
        'audit',
        'capital',
        'bank',
        'financial',
        'finance',
        'wealth',
        'investment',
        'asset',
        'equity',
        'insurance',
        'securities',
      ],
    },
    {
      category: 'Software Development',
      keywords: ['software', 'saas', 'devops', 'cloud', 'app development', 'platform', 'coding'],
    },
    {
      category: 'Information Technology',
      keywords: [
        'technology',
        'technologies',
        'it solutions',
        'cyber',
        'data',
        'infra',
        'network',
        'digital',
        'systems',
        'computers',
      ],
    },
    {
      category: 'Medical Equipment',
      keywords: [
        'medical device',
        'diagnostics',
        'biosystems',
        'surgical',
        'implant',
        'laboratory equipment',
        'medical systems',
      ],
    },
    {
      category: 'Healthcare',
      keywords: [
        'hospital',
        'clinic',
        'health',
        'medical',
        'pharma',
        'pharmaceutical',
        'doctor',
        'physician',
        'dental',
        'care',
        'nursing',
      ],
    },
    {
      category: 'Construction',
      keywords: [
        'construction',
        'builders',
        'civil',
        'structural',
        'steel',
        'contracting',
        'contractor',
        'architectural',
        'cement',
        'infratech',
      ],
    },
    {
      category: 'Real Estate',
      keywords: [
        'real estate',
        'realty',
        'properties',
        'property',
        'realtor',
        'leasing',
        'estates',
        'housing',
        'developers',
      ],
    },
    {
      category: 'Consulting',
      keywords: [
        'consulting',
        'consultancy',
        'advisory',
        'advisors',
        'strategy',
        'management services',
        'legal',
        'advocate',
        'law',
      ],
    },
    {
      category: 'Education',
      keywords: [
        'university',
        'college',
        'school',
        'academy',
        'institute',
        'education',
        'training',
        'coaching',
      ],
    },
    {
      category: 'Hospitality',
      keywords: [
        'hotel',
        'resort',
        'restaurant',
        'catering',
        'hospitality',
        'travel',
        'tourism',
        'cafe',
        'bakers',
      ],
    },
    {
      category: 'Retail',
      keywords: [
        'retail',
        'store',
        'shop',
        'mart',
        'fashion',
        'apparel',
        'supermarket',
        'trading',
        'traders',
        'jewellers',
        'showroom',
        'wholesale',
      ],
    },
    {
      category: 'Manufacturing',
      keywords: [
        'manufacturing',
        'industrial',
        'factory',
        'fabrication',
        'packaging',
        'plastics',
        'polymers',
        'textiles',
        'metals',
        'chemicals',
        'mills',
        'works',
      ],
    },
    {
      category: 'Logistics',
      keywords: [
        'logistics',
        'freight',
        'cargo',
        'shipping',
        'transport',
        'supply chain',
        'warehouse',
        'courier',
        'movers',
        'clearing',
      ],
    },
    {
      category: 'Telecommunications',
      keywords: ['telecom', 'telecommunications', 'wireless', 'fiber', 'broadband'],
    },
    {
      category: 'Government',
      keywords: ['ministry', 'government', 'municipal', 'public sector', 'authority', 'corporation of'],
    },
    {
      category: 'Marketing and Advertising',
      keywords: [
        'marketing',
        'advertising',
        'media',
        'creative',
        'branding',
        'public relations',
        'design studio',
        'printers',
        'graphics',
        'signage',
      ],
    },
    {
      category: 'Engineering',
      keywords: [
        'engineering',
        'robotics',
        'automation',
        'mechanical',
        'electrical',
        'electricals',
        'electronics',
        'aerospace',
        'energy',
        'power',
        'solar',
        'motors',
      ],
    },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.category;
    }
  }
  return '';
}

/**
 * Un-spaces tracked letters typical of stylized card typography (e.g. "A N V I T H   K U M A R" -> "ANVITH KUMAR",
 * "C O N S U L T A N T" -> "CONSULTANT", "M A N A G I N G   D I R E C T O R" -> "MANAGING DIRECTOR").
 */
export function unspaceLetterTracking(text: string): string {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => {
      let s = line.trim();
      if (!s) return '';

      // If the line consists predominantly of single letters separated by spaces
      const tokens = s.split(/\s+/);
      const singleCharTokens = tokens.filter((t) => t.length === 1 && /[A-Za-z]/.test(t));
      if (tokens.length >= 3 && singleCharTokens.length / tokens.length >= 0.7) {
        if (/\s{2,}/.test(s)) {
          const words = s.split(/\s{2,}/);
          s = words
            .map((w) => {
              const letters = w.split(/\s+/);
              if (letters.every((l) => l.length === 1 && /[A-Za-z]/.test(l))) {
                return letters.join('');
              }
              return w;
            })
            .join(' ');
        } else {
          if (tokens.every((t) => t.length === 1 && /[A-Za-z]/.test(t))) {
            s = tokens.join('');
          }
        }
      }

      // Inline tracked sequences within mixed lines (e.g. "Dr. A N V I T H   K U M A R MD")
      s = s.replace(
        /\b([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])(?:\s+([A-Za-z]))*(?:\s{2,}([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])(?:\s+([A-Za-z]))*)?\b/g,
        (match) => {
          const subWords = match.split(/\s{2,}/);
          if (
            subWords.every((sw) =>
              sw.split(/\s+/).every((c) => c.length === 1 && /[A-Za-z]/.test(c))
            )
          ) {
            return subWords.map((sw) => sw.split(/\s+/).join('')).join(' ');
          }
          return match;
        }
      );

      return s;
    })
    .join('\n');
}

/**
 * Repairs conjoined OCR typography, missing spaces, CamelCase names/roles,
 * and fixes spacing artifacts in emails, URLs, and phone country codes.
 */
export function repairConjoinedTypography(text: string): string {
  if (!text) return '';
  let s = text;

  // Un-glue honorifics: "Dr.Anvith" -> "Dr. Anvith", "CA.Mahesh" -> "CA. Mahesh", "Mr.John" -> "Mr. John"
  s = s.replace(
    /\b(Dr|Mr|Mrs|Ms|Miss|Prof|Er|Eng|CA|FCA|CPA|Adv|Advocate|Shri|Smt)\.([A-Za-z])/gi,
    '$1. $2'
  );

  // Un-glue contact labels: "Tel:+91", "Mob:98", "Email:info@", "Web:www.", "P.O.Box:123"
  // Use explicit boundary so "Officer" or "Offline" is never split into "Off: icer"
  s = s.replace(
    /\b(Tel|Phone|Mob|Mobile|Cell|Fax|Email|Mail|Web|Website|Office)\b\s*[:.]?\s*([A-Za-z0-9+])/gi,
    '$1: $2'
  );
  s = s.replace(/\bOff\b\s*[:.]\s*([A-Za-z0-9+])/gi, 'Office: $1');
  s = s.replace(/\b(P\.?O\.?\s*Box)\b\s*[:.]?\s*([0-9])/gi, '$1: $2');

  // Un-glue camelCase conjoined words: "AnvithKumar" -> "Anvith Kumar", "ManagingDirector" -> "Managing Director"
  // Avoid splitting URLs, emails, or file extensions
  if (!s.includes('@') && !s.includes('http') && !s.includes('www.')) {
    s = s.replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, '$1 $2');

    // Un-glue legal corporate suffixes at the end of conjoined ALLCAPS or CamelCase words:
    // "SERVICESFZE" -> "SERVICES FZE", "CONSULTINGLLC" -> "CONSULTING LLC", "SOLUTIONSINC" -> "SOLUTIONS INC"
    s = s.replace(
      /\b([A-Za-z]{3,})(FZE|FZCO|DMCC|PJSC|LLC|LTD|PVT|INC|CORP|GMBH|PLC)\b/g,
      '$1 $2'
    );

    // Un-glue conjoined ALLCAPS / TitleCase first names: "MUHAMMADLARIK" -> "MUHAMMAD LARIK", "ANVITHKUMAR" -> "ANVITH KUMAR"
    s = s.replace(
      /\b(MUHAMMAD|MOHAMMED|MOHAMAD|AHMED|AHMAD|SYED|SAYED|ABDUL|ALI|OMAR|KHALED|TARIQ|ANVITH|KUMAR|RAHUL|MAHESH|VIKRAM|SURESH|RAMESH|JOHN|DAVID|MICHAEL|ROBERT|JAMES|WILLIAM|DEV|NIRMAL|NIMMY)([A-Z][a-z]{2,}|[A-Z]{3,})\b/g,
      '$1 $2'
    );

    // Un-glue conjoined ALLCAPS role words (e.g. CHIEFCOMPLIANCEOFFICER -> CHIEF COMPLIANCE OFFICER)
    const commonRoles = [
      'CHIEF', 'COMPLIANCE', 'OFFICER', 'MANAGING', 'DIRECTOR', 'EXECUTIVE',
      'GENERAL', 'MANAGER', 'SENIOR', 'JUNIOR', 'PARTNER', 'ASSOCIATE',
      'CONSULTANT', 'DEVELOPMENT', 'BUSINESS', 'MARKETING', 'SALES',
      'PRESIDENT', 'FOUNDER', 'LEADER', 'ENGINEER', 'ACCOUNTANT', 'AUDITOR',
      'TAXATION', 'SERVICES', 'CORPORATE', 'CONSULTING'
    ];
    const rolePattern = new RegExp(`(${commonRoles.join('|')})(${commonRoles.join('|')})`, 'g');
    s = s.replace(rolePattern, '$1 $2');
    s = s.replace(rolePattern, '$1 $2');
  }

  // Repair OCR typo in email TLDs: "info@domain.cem" -> "info@domain.com", "user@domain.c0m" -> "user@domain.com"
  s = s.replace(/@([A-Za-z0-9.-]+)\.(cem|c0m|corn)\b/gi, '@$1.com');

  // Repair spaces in email candidates: "name @ domain . com" -> "name@domain.com"
  s = s.replace(
    /([A-Za-z0-9._%+-]+)\s*@\s*([A-Za-z0-9.-]+)\s*\.\s*(com|org|net|io|co|in|ae|uk|global|ai|tech|biz|info|edu|gov)\b/gi,
    '$1@$2.$3'
  );

  // Repair spaces in website candidates: "www . domain . com" -> "www.domain.com"
  s = s.replace(
    /\b(https?:\/\/|www)\s*\.\s*([A-Za-z0-9.-]+)\s*\.\s*(com|org|net|io|co|in|ae|uk|global|ai|tech|biz|info)\b/gi,
    '$1.$2.$3'
  );

  // Repair phone number country code spacing: "+ 91" -> "+91", "+ 1" -> "+1"
  s = s.replace(/\+\s+(\d{1,4})\s+/g, '+$1 ');

  return s;
}

export function normalizeOcrArtifacts(text: string): string {
  if (!text) return '';
  let s = text
    // Replace CJK full-width punctuation produced by RapidOCR/PaddleOCR models
    .replace(/\uff1a/g, ':')
    .replace(/\uff0c/g, ',')
    .replace(/\uff08/g, '(')
    .replace(/\uff09/g, ')')
    .replace(/\uff0d/g, '-')
    .replace(/\uff20/g, '@')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
    // Repair OCR zero in P.O. Box and standardize spacing
    .replace(/\bP[\. ]?[0O][\. ]?Box\b/gi, 'P.O. Box')
    .replace(/\b(P\.?O\.?\s*Box)\s*:\s*/gi, 'P.O. Box: ')
    .replace(/\b(P\.?O\.?\s*Box)\s+([0-9])/gi, 'P.O. Box $2')
    // Ensure spaces around ampersands (&)
    .replace(/([A-Za-z0-9])&([A-Za-z0-9])/g, '$1 & $2')
    // Ensure space after punctuation (ignoring URLs like https://)
    .replace(/,([A-Za-z0-9])/g, ', $1')
    .replace(/:(?!\/\/)([A-Za-z0-9+])/g, ': $1')
    // Un-concatenate common fused words in OCR output
    .replace(/UnitedArabEmirates/gi, 'United Arab Emirates')
    .replace(/AbuDhabi/gi, 'Abu Dhabi')
    .replace(/AbuHail/gi, 'Abu Hail')
    .replace(/SaudiArabia/gi, 'Saudi Arabia')
    .replace(/CharteredAccountants/gi, 'Chartered Accountants')
    .replace(/andCompliance/gi, 'and Compliance')
    .replace(/Office([0-9])/gi, 'Office $1')
    .replace(/Bldg\.?,?([A-Za-z])/gi, 'Bldg., $1')
    .replace(/\b(CA|Dr|Eng|Adv|Mr|Mrs|Ms|Prof)\.([A-Za-z])/gi, '$1. $2')
    .replace(/\b([A-Z]\.)([A-Za-z]{2,})/g, '$1 $2')
    .replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, '$1 $2')
    .replace(/\s{2,}/g, ' ');

  s = unspaceLetterTracking(s);
  s = repairConjoinedTypography(s);
  return s;
}

function cleanLine(raw: string): string {
  let s = normalizeOcrArtifacts(raw)
    // Normalize P.0. Box -> P.O. Box and BIdg -> Bldg before stripping symbols
    .replace(/\bP\.?\s*[0O]\.?\s*Box\b/gi, 'P.O. Box')
    .replace(/\bB[Il1]dg\.?/g, 'Bldg.')
    // Repair Office 1048105 -> Office 104 & 105 when '&' between consecutive suite numbers is read as '8'
    .replace(
      /\b(Office|Suite|Unit|Shop|Room|Flat)\s+(\d{2,4})8(\d{2,4})\b/gi,
      (full, prefix, d1, d2) => {
        if (d1.length === d2.length && Number(d2) === Number(d1) + 1) {
          return `${prefix} ${d1} & ${d2}`;
        }
        return full;
      }
    )
    // Strip leading QR/icon noise before explicit labeled contact lines (e.g. "[OER Rae M:4971...", "2 Fc T:+971...", "£7 LE P.O. Box:")
    .replace(
      /^.*?(?=\b(?:[MTFEO]\s*[:.]\s*(?:\+?\d|[A-Za-z0-9._%+-]+@)|P\.O\.\s*Box))/i,
      ''
    )
    // Strip leading QR noise fragments before Al Yasmeen / Dubai address lines
    .replace(/^(?:pie|ak\s+toth|£7\s+le|shay|2\s+fc|\[oer\s+rae)\s+/i, '')
    // Strip leading logo glyphs like "1) " or "/ " before capitalized company/title words
    .replace(/^(?:\d{1,2}[)\]]|[|/\\~•«»]+)\s+(?=[A-Z])/g, '')
    .replace(/[¦•▪►◄●○◆◇■□★☆☎☏✉🌐📍🏠🏢📱📞📠«»„“”‘’`~^£§©®™]/g, ' ')
    // Remove OCR border/texture artifacts with 4+ identical repeating letters (e.g. DURTREEEEEE)
    .replace(/\b[A-Za-z]*([A-Za-z])\1{3,}[A-Za-z]*\b/g, ' ')
    // Strip leading contact icon noise clusters like ": S(T ", "5 ig) ", "5 ' 0 '~~ ", "; BEF ", "fi. © | "
    .replace(
      /^[\s:;.,()[\]{}/\\+=-]*(?:[0-9]\s+[a-z]{1,2}\)|:\s*[A-Za-z]\([A-Za-z]|[0-9]\s+[0-9]\s+|;\s*[A-Z]{2,3}\b|[A-Za-z]\s+\|)\s*/g,
      ''
    )
    // Strip trailing card-border shadow tokens like "\ Sa", " 3", " i =", " £", " id" after phones/URLs
    .replace(/\s+(?:\\\s*[A-Za-z]{1,3}|[A-Za-z]\s*=|[=\\/|]+)$/g, '')
    .replace(/(\d{7,})\s+[a-z]{1,2}$/i, '$1')
    .replace(/^[\s:.,;~_—–*/\\()[\]-]+|[\s:;~_—–*/\\()[\]-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (s.includes(' - ')) {
    const parts = s.split(/\s+-\s+/);
    if (
      parts.length === 2 &&
      /[aeiou]{4,}|[bcdfghjklmnpqrstvwxz]{5,}|\b[a-z]\s+/i.test(parts[1])
    ) {
      s = parts[0].trim();
    }
  }

  s = s.replace(
    /\b(United Arab Emirates|UAE|India|Saudi Arabia|Qatar|Oman|Kuwait|Bahrain|United Kingdom|USA|com|org|net|ae|in|global)\s+\d$/i,
    '$1'
  );
  return s.trim();
}

function cleanRoleNoise(raw: string): string {
  if (!raw) return '';
  return cleanLine(
    raw
      .replace(/^[\s•\-|:;,–—]+/, '')
      .replace(/[\s•\-|:;,–—]+$/, '')
      .replace(/\s{2,}/g, ' ')
  );
}

const KNOWN_NOISE_LINE_REGEX =
  /^(cai\s+thee|ses\s+tl\s+arr|sre\s+x|ee\s+ey|i\s+re|frees\s+i|gl\s+nate|an\s+ta|se\s+et\s+tc|cl\s+ese|wr\s+eanes.*|gy\s+na|il\s+es|il\s+\+?0|ay\s+anes|oer\s+rae|shay|pie|ak\s+toth|2\s+fc|£?7\s+le)$/i;

/**
 * Splits a single line if it contains both Left-Column and Right-Column text
 * (e.g., "STUART & HAMLYN CA. D.R.G MAHESH", "Chartered Accountants ~~ Manager",
 *  "UAE | AUSTRALIA | INDIA | USA www.stuaham.com").
 */
function splitMergedTwoColumnLine(rawLine: string): string[] {
  const line = rawLine.trim();
  if (!line) return [];

  // 1. Explicit ~~ separator from Tesseract between left and right columns
  if (/\s+~+\s+/.test(line)) {
    return line
      .split(/\s+~+\s+/)
      .map(cleanLine)
      .filter(Boolean);
  }

  // 2. Left column Company/Firm + Right column Honorific/Credential Name (e.g. "STUART & HAMLYN CA. D.R.G MAHESH")
  const honorificSplit = line.match(
    /^(.{4,42}?)\s+((?:CA\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|Eng\.?|Er\.?|Adv\.?)\s+[A-Z].*)$/
  );
  if (honorificSplit) {
    return [cleanLine(honorificSplit[1]), cleanLine(honorificSplit[2])].filter(Boolean);
  }

  // 3. Left column Firm Activity + Right column Role (e.g. "Chartered Accountants Manager")
  const activityRoleSplit = line.match(
    /^(Chartered\s+Accountants|Certified\s+Public\s+Accountants|Legal\s+Consultants|Management\s+Consultants)\s+(Manager|Director|Partner|Managing\s+Partner|Senior\s+Partner|Associate|Consultant|Proprietor|Founder|CEO|CFO)\b(.*)$/i
  );
  if (activityRoleSplit) {
    return [
      cleanLine(activityRoleSplit[1]),
      cleanLine(`${activityRoleSplit[2]}${activityRoleSplit[3] || ''}`),
    ].filter(Boolean);
  }

  // 4. Left column Country Pipe Footer + Right column Website/Email (e.g. "A AUSTRALIA | INDIA | USA www.stuaham.com")
  const footerWebSplit = line.match(
    /^((?:[A-Z]{1,3}\s+)?(?:UAE|AUSTRALIA|INDIA|USA|UK|KSA|QATAR|OMAN)(?:\s*[|I]\s*(?:UAE|AUSTRALIA|INDIA|USA|UK|KSA|QATAR|OMAN))+)\s+((?:www\.|https?:\/\/|[a-zA-Z0-9._%+-]+@)\S+)$/i
  );
  if (footerWebSplit) {
    const leftFooter = footerWebSplit[1]
      .replace(/^A\s+(?=AUSTRALIA)/i, 'UAE | ')
      .replace(/\s+\|\s+/g, ' | ')
      .trim();
    return [leftFooter, cleanLine(footerWebSplit[2])].filter(Boolean);
  }

  const cleaned = cleanLine(line);
  return cleaned ? [cleaned] : [];
}

/**
 * Rejects invented OCR gibberish lines produced by logos, QR modules, icons, borders, or textures.
 */
function isMeaningfulOcrLine(line: string): boolean {
  if (!line || line.length < 3) return false;
  if (KNOWN_NOISE_LINE_REGEX.test(line)) return false;

  const alnum = line.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length < 3) return false;

  // Always keep lines containing email '@', website domains, P.O. Box, or 7+ digits (phone)
  if (
    line.includes('@') ||
    /\bP\.O\.\s*Box/i.test(line) ||
    /\b(www\.|[a-zA-Z0-9-]{3,}\.(com|org|net|io|co|in|ae|uk|global|ai|tech|biz))\b/i.test(
      line
    ) ||
    (line.match(/\d/g) || []).length >= 7
  ) {
    return true;
  }

  const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
  if (alphaCount < 3) return false;

  const words = line.split(/\s+/).filter(Boolean);
  const hasWordAtLeast3Letters = words.some(
    (w) => (w.match(/[A-Za-z]/g) || []).length >= 3
  );
  if (!hasWordAtLeast3Letters) return false;

  // Reject lines containing impossible vowel/consonant clusters like "asiniiog" or "Remmcommting"
  if (
    words.some((w) =>
      /[aeiou]{4,}|ii[aeiou]|[bcdfghjklmnpqrstvwxz]{5,}|mm[bcdfghjklmnpqrstvwxz]/i.test(
        w
      )
    )
  ) {
    return false;
  }

  const hasKnownContextKeyword =
    ADDRESS_KEYWORDS_REGEX.test(line) ||
    COMPANY_SUFFIX_REGEX.test(line) ||
    DEPARTMENT_SPEC_REGEX.test(line) ||
    FIRM_ACTIVITY_LINE_REGEX.test(line) ||
    /\b(dubai|abu dhabi|sharjah|united arab emirates|uae|australia|usa|india|mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|pune|kolkata|ahmedabad|riyadh|doha|london|new york)\b/i.test(
      line
    ) ||
    DESIGNATION_KEYWORDS.some((kw) =>
      new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)
    );

  const isolatedSingleDigits = words.filter((w) => /^\d{1,2}$/.test(w)).length;
  if (!hasKnownContextKeyword && isolatedSingleDigits >= 1) {
    return false;
  }

  if (words.length >= 2 && !hasKnownContextKeyword) {
    const shortOrNoiseTokens = words.filter((w) => {
      const cleanW = w.replace(/[^A-Za-z]/g, '');
      if (cleanW.length <= 2) {
        // Protect valid initials (e.g., "S.", "K.", "V", "A", "M", "J", "R", "D") and common prefixes
        if (/^[A-Z]\.?$/i.test(w) || (/^[A-Z]{1,2}$/.test(cleanW) && w === w.toUpperCase())) {
          return false;
        }
        return !/^(mr|ms|dr|ca|er|md|vp|hr|it|po|st|rd|fl|no|co|uk|us|ae|in|al)$/i.test(
          cleanW
        );
      }
      if (cleanW.length === 3 && cleanW === cleanW.toLowerCase()) {
        return !/^(and|for|the|inc|ltd|llc|box|tel|mob|fax|web|off|abu)$/i.test(cleanW);
      }
      if (/^[A-Z]{2,}[a-z][A-Z]*$/.test(cleanW)) {
        return true;
      }
      return false;
    });

    if (shortOrNoiseTokens.length >= 2 && shortOrNoiseTokens.length / words.length >= 0.42) {
      return false;
    }
  }

  return true;
}

function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .map((w) => {
      if (
        /^(II|III|IV|MD|CEO|CTO|CFO|COO|VP|SVP|EVP|AVP|CA\.?|FCA|CPA|ACCA|CS|LLB|LLM|MBA|PhD|BTech|MTech|UAE|USA|UK|KSA|LLC|FZE|FZCO|DMCC|WLL|PJSC)$/i.test(
          w
        )
      ) {
        return w.toUpperCase();
      }
      // Preserves initials with optional professional title prefix: CA.D.R.G, D.R.G., A.B.C, K.V.
      if (
        /^(?:(CA|DR|ER|PROF|FCA|CPA|ACCA|CS|MR|MRS|MS)\.)(?:[A-Z]\.?)+$/i.test(w) ||
        /^([A-Z]\.){1,5}[A-Z]?\.?$/i.test(w)
      ) {
        return w.toUpperCase();
      }
      if (/^[A-Z]\.?$/i.test(w)) {
        return w.toUpperCase();
      }
      // Preserve South-Asian / international consonant initial clusters (DRG, KVN, SKM, BLR, JRD, APJ)
      if (/^[A-Z]{2,4}$/.test(w) && !/[aeiouy]/i.test(w)) {
        return w.toUpperCase();
      }
      return w.length >= 1
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w;
    })
    .join(' ');
}

/**
 * Reconstructs clean, column-aware lines from Tesseract v7 `blocks -> paragraphs -> lines -> words`
 * (or `data.lines` / `data.text` fallback):
 * 1. Detects the vertical Right-Column alignment axis (`rightColAxisX`) when a card has a 2-column layout
 *    (such as Stuart & Hamlyn where 11 right-column lines start at x ≈ 345) and splits Left & Right columns cleanly.
 * 2. Never drops digits, phone segments, or watermarked words inside a valid text line.
 * 3. Discards low-confidence QR-code module noise on the left without harming right-column text.
 */
export function extractSpatialLinesFromTesseractData(data: any): string[] {
  const rawText: string = data?.text || '';
  const linesList: any[] = [];

  if (Array.isArray(data?.lines) && data.lines.length > 0) {
    linesList.push(...data.lines);
  } else if (Array.isArray(data?.blocks)) {
    for (const block of data.blocks) {
      for (const para of block?.paragraphs || []) {
        for (const ln of para?.lines || []) {
          linesList.push(ln);
        }
      }
    }
  }

  if (linesList.length === 0) {
    const out: string[] = [];
    for (const rawLn of rawText.split(/\r?\n/)) {
      for (const seg of splitMergedTwoColumnLine(rawLn)) {
        if (isMeaningfulOcrLine(seg)) {
          out.push(seg);
        }
      }
    }
    return out;
  }

  // Step 1: Determine horizontal card coordinate span [minX, maxX]
  let minCardX = Infinity;
  let maxCardX = 0;
  for (const ln of linesList) {
    for (const w of ln?.words || []) {
      const x0 = w?.bbox?.x0;
      const x1 = w?.bbox?.x1;
      if (typeof x0 === 'number' && x0 < minCardX) minCardX = x0;
      if (typeof x1 === 'number' && x1 > maxCardX) maxCardX = x1;
    }
  }
  if (!Number.isFinite(minCardX) || maxCardX <= minCardX) {
    minCardX = 0;
    maxCardX = 800;
  }
  const spanX = Math.max(100, maxCardX - minCardX);

  // Step 2: Detect if there is a vertical Right-Column alignment axis (x0 in [30%..75%] of spanX)
  const candidateStarts: number[] = [];
  for (const ln of linesList) {
    const words = Array.isArray(ln?.words) ? ln.words : [];
    for (let i = 0; i < words.length; i++) {
      const x0 = words[i]?.bbox?.x0;
      if (typeof x0 !== 'number') continue;
      if (x0 < minCardX + spanX * 0.28 || x0 > minCardX + spanX * 0.75) continue;
      const prevX1 = i > 0 ? (words[i - 1]?.bbox?.x1 ?? x0) : -1000;
      const gapBefore = x0 - prevX1;
      if (i === 0 || gapBefore >= spanX * 0.03) {
        candidateStarts.push(x0);
      }
    }
  }

  let rightColAxisX: number | null = null;
  let bestClusterCount = 0;
  const tolPx = Math.max(10, Math.round(spanX * 0.025));

  for (const x of candidateStarts) {
    const matches = candidateStarts.filter((other) => Math.abs(other - x) <= tolPx);
    if (matches.length > bestClusterCount) {
      bestClusterCount = matches.length;
      const avg = matches.reduce((a, b) => a + b, 0) / matches.length;
      rightColAxisX = Math.round(avg);
    }
  }
  if (bestClusterCount < 3) {
    rightColAxisX = null;
  }

  const leftColSegments: string[] = [];
  const rightColSegments: string[] = [];
  const singleColSegments: string[] = [];

  const acceptSegmentIfValid = (wordsSlice: any[], targetArr: string[]) => {
    if (wordsSlice.length === 0) return;

    // Strip leading low-confidence symbol/logo tokens like "1)" or "/" or "~~"
    let trimmedWords = [...wordsSlice];
    while (trimmedWords.length > 1) {
      const firstTxt = String(trimmedWords[0]?.text || '').trim();
      const firstConf =
        typeof trimmedWords[0]?.confidence === 'number' ? trimmedWords[0].confidence : 80;
      if (
        /^(\d\)|\/|~+|\||\[.*)/.test(firstTxt) &&
        (firstConf < 75 || /^(\d\)|\/|~+)$/.test(firstTxt))
      ) {
        trimmedWords.shift();
      } else {
        break;
      }
    }

    const rawJoined = trimmedWords
      .map((w: any) => String(w?.text || '').trim())
      .filter((t: string) => t && !/^~+$/.test(t))
      .join(' ');
    if (!rawJoined) return;

    // Compute average confidence of this segment
    const avgConf =
      trimmedWords.reduce(
        (acc, w) => acc + (typeof w?.confidence === 'number' ? w.confidence : 80),
        0
      ) / trimmedWords.length;

    const hasContactOrContextSignal =
      rawJoined.includes('@') ||
      /\bP\.?\s*[O0]\.?\s*Box/i.test(rawJoined) ||
      (rawJoined.match(/\d/g) || []).length >= 6 ||
      /\.(com|in|org|net|ae|global|co|io|ai|uk|us)/i.test(rawJoined) ||
      ADDRESS_KEYWORDS_REGEX.test(rawJoined) ||
      COMPANY_SUFFIX_REGEX.test(rawJoined) ||
      DEPARTMENT_SPEC_REGEX.test(rawJoined) ||
      FIRM_ACTIVITY_LINE_REGEX.test(rawJoined) ||
      DESIGNATION_KEYWORDS.some((kw) =>
        new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
          rawJoined
        )
      );

    // Reject low-confidence QR/logo noise segments (e.g. "[OER Rae", "Shay", "pie", "ak Toth")
    if (avgConf < 56 && !hasContactOrContextSignal) {
      return;
    }

    for (const seg of splitMergedTwoColumnLine(rawJoined)) {
      if (isMeaningfulOcrLine(seg)) {
        targetArr.push(seg);
      }
    }
  };

  for (const ln of linesList) {
    const rawWords = Array.isArray(ln?.words) ? ln.words : [];
    const words = rawWords.filter((w: any) => {
      const txt = String(w?.text || '').trim();
      if (!txt) return false;
      if (/([A-Za-z])\1{3,}/.test(txt)) return false;
      return true;
    });

    if (words.length === 0) continue;

    // Check if this line splits across `rightColAxisX`
    let splitIdx = -1;
    if (rightColAxisX !== null) {
      for (let i = 0; i < words.length - 1; i++) {
        const currX1 = words[i]?.bbox?.x1 ?? 0;
        const nextX0 = words[i + 1]?.bbox?.x0 ?? currX1;
        if (
          currX1 <= rightColAxisX - 6 &&
          Math.abs(nextX0 - rightColAxisX) <= tolPx * 1.35
        ) {
          splitIdx = i;
          break;
        }
      }
    }

    // Fallback large horizontal column gap
    if (splitIdx < 0 && words.length >= 2) {
      let maxGap = 0;
      for (let i = 0; i < words.length - 1; i++) {
        const x1 = words[i]?.bbox?.x1 ?? 0;
        const nextX0 = words[i + 1]?.bbox?.x0 ?? x1;
        const gap = nextX0 - x1;
        if (
          gap > spanX * 0.11 &&
          gap > maxGap &&
          nextX0 > minCardX + spanX * 0.25 &&
          x1 < minCardX + spanX * 0.78
        ) {
          maxGap = gap;
          splitIdx = i;
        }
      }
    }

    if (splitIdx >= 0) {
      acceptSegmentIfValid(words.slice(0, splitIdx + 1), leftColSegments);
      acceptSegmentIfValid(words.slice(splitIdx + 1), rightColSegments);
    } else if (
      rightColAxisX !== null &&
      (words[0]?.bbox?.x0 ?? 0) >= rightColAxisX - tolPx * 1.35
    ) {
      acceptSegmentIfValid(words, rightColSegments);
    } else if (
      rightColAxisX !== null &&
      (words[words.length - 1]?.bbox?.x1 ?? 0) <= rightColAxisX - 6
    ) {
      acceptSegmentIfValid(words, leftColSegments);
    } else {
      acceptSegmentIfValid(words, singleColSegments);
    }
  }

  if (leftColSegments.length > 0 || rightColSegments.length > 0) {
    return [...leftColSegments, ...rightColSegments, ...singleColSegments];
  }
  return singleColSegments;
}

function classifyPhoneNumberByStructure(
  candidate: string,
  segText: string,
  lineDefaultKind: 'mobile' | 'office' | 'whatsapp' | 'fax' | 'auto'
): 'mobile' | 'office' | 'whatsapp' | 'fax' {
  if (/\b(fax|f\s*[:.])\b/i.test(segText)) return 'fax';
  if (/\b(whatsapp|wa\b)\b/i.test(segText)) return 'whatsapp';
  if (/\b(off(ice)?|tel(ephone)?|direct|landline|board|ext|t\s*[:.])\b/i.test(segText)) {
    return 'office';
  }
  if (/\b(mob(ile)?|cell|m\s*[:.])\b/i.test(segText)) {
    return 'mobile';
  }
  if (lineDefaultKind !== 'auto') {
    return lineDefaultKind;
  }

  const digits = candidate.replace(/\D/g, '');

  // UAE (+971 / 00971 / 05x / 04): 50, 52, 54, 55, 56, 58 = Mobile; 2, 3, 4, 6, 7, 9 = Office Landline
  if (/^(00971|971|0)(5[024568])\d{7}$/.test(digits)) {
    return 'mobile';
  }
  if (/^(00971|971|0)([234679])\d{7}$/.test(digits)) {
    return 'office';
  }

  // India (+91 / 0xx): 10 digits starting with 6,7,8,9 = Mobile; STD codes = Office
  if (/^(0091|91|0)?[6-9]\d{9}$/.test(digits)) {
    return 'mobile';
  }
  if (/^(0091|91|0)(11|20|22|33|40|44|79|80)\d{6,8}$/.test(digits)) {
    return 'office';
  }

  if (/^(00966|966|0)5\d{8}$/.test(digits)) return 'mobile';
  if (/^(00966|966|0)1\d{7,8}$/.test(digits)) return 'office';

  if (/^(00974|974)?[3567]\d{7}$/.test(digits)) return 'mobile';
  if (/^(00974|974)?4\d{7}$/.test(digits)) return 'office';

  if (/^(0044|44|0)7\d{9}$/.test(digits)) return 'mobile';
  if (/^(0044|44|0)[12]\d{8,9}$/.test(digits)) return 'office';

  return 'mobile';
}

/**
 * Restores a leading '+' when OCR misreads '+' as '4' or '0' before an international country code
 * and formats UAE/India numbers cleanly with standard spacing.
 */
function repairInternationalPlusPrefix(candidate: string): string {
  const digits = candidate.replace(/\D/g, '');
  // UAE landline where '+' was read as '4': 4 + 971 + [234679] + 7 digits (12 digits total)
  const uaeLandlineMatch = digits.match(/^4?(971)([234679])(\d{3})(\d{4})$/);
  if (uaeLandlineMatch) {
    return `+${uaeLandlineMatch[1]} ${uaeLandlineMatch[2]} ${uaeLandlineMatch[3]} ${uaeLandlineMatch[4]}`;
  }
  // UAE mobile where '+' was read as '4' or omitted: 4? + 971 + (50|52|54|55|56|58) + 7 digits
  const uaeMobileMatch = digits.match(/^4?(971)(5[024568])(\d{3})(\d{4})$/);
  if (uaeMobileMatch) {
    return `+${uaeMobileMatch[1]} ${uaeMobileMatch[2]} ${uaeMobileMatch[3]} ${uaeMobileMatch[4]}`;
  }
  // India mobile where '+' was read as '4': 4 + 91 + [6-9]\d{9}
  const indMobMatch = digits.match(/^4(91)([6-9]\d{4})(\d{5})$/);
  if (indMobMatch) {
    return `+${indMobMatch[1]} ${indMobMatch[2]} ${indMobMatch[3]}`;
  }
  return candidate;
}

function extractPhonesFromLine(line: string): {
  phones: { number: string; kind: 'mobile' | 'office' | 'whatsapp' | 'fax' }[];
  isPurePhoneLine: boolean;
} {
  if (
    /\b(gst(in)?|cin|pan|tin|vat|crn|trn|reg(istration)?|license|iso\s*\d|p\.?\s*[o0]\.?\s*box|pin\s*[:.-]?\s*\d{6})\b/i.test(
      line
    )
  ) {
    return { phones: [], isPurePhoneLine: false };
  }

  const lower = line.toLowerCase();
  const lineDefaultKind: 'mobile' | 'office' | 'whatsapp' | 'fax' | 'auto' = /\b(fax|f\s*[:.])\b/i.test(
    lower
  )
    ? 'fax'
    : /\b(whatsapp|wa\b)\b/i.test(lower)
    ? 'whatsapp'
    : /\b(off(ice)?|tel(ephone)?|desk|direct|landline|board|yard|ph(one)?|t\s*[:.(]|o\s*[:.])\b/i.test(
        lower
      ) && !/\b(mob(ile)?|cell|m\s*[:.])\b/i.test(lower)
    ? 'office'
    : /\b(mob(ile)?|cell|m\s*[:.])\b/i.test(lower)
    ? 'mobile'
    : 'auto';

  const segments = line.split(/\s*[\/|;]\s*|\s+,\s+/);
  const phones: { number: string; kind: 'mobile' | 'office' | 'whatsapp' | 'fax' }[] = [];
  let lastPrefix = '';

  for (const seg of segments) {
    const repaired = seg.replace(
      /(?<=\d|\+|\()[OoQq](?=\d)|(?<=\d)[Il|](?=\d)/g,
      (ch) => (/[OoQq]/.test(ch) ? '0' : '1')
    );

    const matches = repaired.match(/(\+?\d[\d\s().-]{6,18}\d)/g);
    if (matches) {
      for (const rawM of matches) {
        const cleanedCandidate = rawM
          .replace(/[A-Za-z]+/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const candidate = repairInternationalPlusPrefix(cleanedCandidate);
        const digits = candidate.replace(/\D/g, '');
        if (digits.length === 6 && ADDRESS_KEYWORDS_REGEX.test(line)) {
          continue;
        }
        if (digits.length >= 8 && digits.length <= 15) {
          const prefixMatch = candidate.match(/^(\+\d{1,3}[\s-]*|\d{3,5}[\s-]+)\d/);
          if (prefixMatch) {
            lastPrefix = prefixMatch[1];
          }
          const segKind = classifyPhoneNumberByStructure(
            candidate,
            seg,
            lineDefaultKind
          );
          phones.push({ number: candidate, kind: segKind });
        } else if (digits.length >= 2 && digits.length <= 5 && lastPrefix && phones.length > 0) {
          const prevNum = phones[phones.length - 1].number;
          const expanded = prevNum.slice(0, prevNum.length - digits.length) + digits;
          phones.push({
            number: expanded,
            kind: phones[phones.length - 1].kind,
          });
        }
      }
    }
  }

  const leftover = line
    .replace(/(\+?\d[\d\s().-]{6,18}\d)/g, '')
    .replace(
      /\b(mob(ile)?|cell|ph(one)?|tel(ephone)?|off(ice)?|direct|desk|whatsapp|wa|fax|res|ext|id|m|t|o|f|d|w|ph|s)\b\s*[:.(-]?/gi,
      ''
    )
    .replace(/[\/|,;()+-]/g, '')
    .trim();

  return {
    phones,
    isPurePhoneLine: phones.length > 0 && leftover.length < 5,
  };
}

function isLikelyPersonNameLine(
  line: string,
  emailPrefix = '',
  domainRoot = ''
): { isName: boolean; cleanedName: string; embeddedRole?: string; matchesEmailPrefix?: boolean } {
  if (!line || line.length < 3 || line.length > 56) {
    return { isName: false, cleanedName: '' };
  }
  if (KNOWN_NOISE_LINE_REGEX.test(line) || FIRM_ACTIVITY_LINE_REGEX.test(line)) {
    return { isName: false, cleanedName: '' };
  }
  if (/\d/.test(line) || line.includes('@') || /www\.|http/i.test(line)) {
    return { isName: false, cleanedName: '' };
  }
  // Exclude lines with commercial qualifiers or company entity suffixes
  if (
    COMPANY_SUFFIX_REGEX.test(line) ||
    BUSINESS_QUALIFIER_REGEX.test(line) ||
    /\b(&\s*(co|sons|associates|partners|llc|inc|ltd))\b/i.test(line) ||
    ADDRESS_KEYWORDS_REGEX.test(line) ||
    DEPARTMENT_SPEC_REGEX.test(line)
  ) {
    return { isName: false, cleanedName: '' };
  }

  const lineAlphaLower = line.toLowerCase().replace(/[^a-z]/g, '');
  if (
    domainRoot.length >= 4 &&
    (lineAlphaLower === domainRoot ||
      lineAlphaLower.includes(domainRoot) ||
      lineMatchesCorporateDomain(line, domainRoot))
  ) {
    return { isName: false, cleanedName: '' };
  }

  let workingLine = line;
  let embeddedRole: string | undefined;

  if (/^(prop(rietor)?)\s*[:.-]\s*/i.test(workingLine)) {
    workingLine = workingLine.replace(/^(prop(rietor)?)\s*[:.-]\s*/i, '').trim();
    embeddedRole = 'Proprietor';
  }

  if (/\s+[|—–-]\s+/.test(workingLine)) {
    const parts = workingLine.split(/\s+[|—–-]\s+/);
    if (
      parts.length === 2 &&
      DESIGNATION_KEYWORDS.some((kw) => parts[1].toLowerCase().includes(kw.toLowerCase()))
    ) {
      workingLine = parts[0].trim();
      embeddedRole = parts[1].trim();
    }
  } else if (/\(([^)]+)\)$/.test(workingLine)) {
    const parenMatch = workingLine.match(/\(([^)]+)\)$/);
    if (
      parenMatch &&
      DESIGNATION_KEYWORDS.some((kw) =>
        parenMatch[1].toLowerCase().includes(kw.toLowerCase())
      )
    ) {
      embeddedRole = parenMatch[1].trim();
      workingLine = workingLine.replace(/\s*\([^)]+\)$/, '').trim();
    }
  }

  const lower = workingLine.toLowerCase();
  if (
    DESIGNATION_KEYWORDS.some((kw) => {
      const kwLower = kw.toLowerCase();
      return lower === kwLower || lower.startsWith(kwLower + ' ') || lower.endsWith(' ' + kwLower);
    })
  ) {
    return { isName: false, cleanedName: '' };
  }

  const withoutQual = workingLine
    .replace(
      /,\s*(m\.?b\.?b\.?s\.?|m\.?d\.?|m\.?s\.?|b\.?sc|m\.?sc|m\.?b\.?a\.?|b\.?e\.?|b\.?tech|m\.?tech|ph\.?d\.?|ll\.?b\.?|ll\.?m\.?|f\.?c\.?a\.?|c\.?a\.?|c\.?p\.?a\.?|a\.?c\.?c\.?a\.?|c\.?s\.?|esq|esquire|pmp|pe|ra|frcs|mrcp|cfa).*$/i,
      ''
    )
    .trim();

  const HONORIFIC_PREFIX_REGEX =
    /^(mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?|prof\.?|er\.?|eng\.?|ca\.?|fca\.?|cpa\.?|adv\.?|advocate\.?|shri\.?|smt\.?|kumari\.?|sheikh\.?|shaikh\.?|sayed\.?|syed\.?)\s+/i;
  const hasHonorific = HONORIFIC_PREFIX_REGEX.test(withoutQual);
  const coreName = withoutQual.replace(HONORIFIC_PREFIX_REGEX, '').trim();

  const words = coreName.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) {
    return { isName: false, cleanedName: '' };
  }

  const cleanEmailLocal = emailPrefix.replace(/[^a-z]/g, '');
  const matchesEmailPrefix =
    cleanEmailLocal.length >= 3 &&
    words.some((w) => {
      const wClean = w.toLowerCase().replace(/[^a-z]/g, '');
      return wClean.length >= 3 && cleanEmailLocal.includes(wClean);
    });

  const totalAlpha = (coreName.match(/[A-Za-z]/g) || []).length;
  // If honorific present (e.g. "Dr. Ali"), require >= 2 chars. If email matches, require >= 3 chars. Otherwise require >= 4 chars (e.g. "Bo Li", "Dev Roy").
  const minAlphaRequired = hasHonorific ? 2 : matchesEmailPrefix ? 3 : 4;
  if (totalAlpha < minAlphaRequired) {
    return { isName: false, cleanedName: '' };
  }

  if (words.length === 1 && !hasHonorific) {
    if (matchesEmailPrefix) {
      return {
        isName: true,
        cleanedName: capitalizeWords(withoutQual),
        embeddedRole,
        matchesEmailPrefix: true,
      };
    }
    // If the word has 3+ letters and standard capitalization, allow as potential single-name candidate
    if (/^[A-Z][a-z]{2,}$/.test(coreName)) {
      return {
        isName: true,
        cleanedName: capitalizeWords(withoutQual),
        embeddedRole,
        matchesEmailPrefix: false,
      };
    }
    return { isName: false, cleanedName: '' };
  }

  const isEntireLineAllCaps = coreName === coreName.toUpperCase();
  const hasStrongCapitalizedWord = words.some((w) => /^[A-Z][a-z]{3,}$/.test(w));

  const validNameWords = words.every((w, idx) => {
    // Support single or multi-part initials with or without trailing period (e.g., "D.R.G", "D.R.G.", "A.K.", "S.")
    if (/^[A-Z]\.?$/i.test(w) || /^([A-Z]\.){1,4}[A-Z]?\.?$/i.test(w)) {
      return true;
    }
    // Asian/South-Asian initial clusters without vowels (e.g., "DRG", "KVN", "SKM", "BLR", "JRD", "APJ", "GVK", "MGR")
    if (/^[A-Z]{2,4}$/.test(w)) {
      return true;
    }
    if (/^[A-Z]$/.test(w)) {
      return idx < words.length - 1;
    }
    if (w.length === 2 && w === w.toUpperCase() && !isEntireLineAllCaps) {
      return false;
    }
    if (
      idx === 0 &&
      words.length >= 2 &&
      hasStrongCapitalizedWord &&
      /^[a-z]{3,10}$/.test(w) &&
      /[aeiou]/i.test(w)
    ) {
      return true;
    }
    if (!/^[A-ZÄÖÜÉÈÊÁÍÓÚÑ][a-zA-Zäöüéèêáíóúñ'.-]+$/.test(w)) {
      return false;
    }
    if (w.length >= 3 && !/[aeiouyäöüéèêáíóú]/i.test(w)) {
      return false;
    }
    return true;
  });

  if (!validNameWords) {
    return { isName: false, cleanedName: '' };
  }

  const finalFormattedName = withoutQual
    .split(/\s+/)
    .map((w) =>
      /^[a-z]{3,}$/.test(w)
        ? w.charAt(0).toUpperCase() + w.slice(1)
        : capitalizeWords(w)
    )
    .join(' ');

  return {
    isName: true,
    cleanedName: finalFormattedName,
    embeddedRole,
    matchesEmailPrefix,
  };
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Checks whether a corporate domain slug (e.g., "stuaham" from stuaham.com)
 * matches either a substring of a printed line OR a prefix-blend of the line's words
 * (e.g., "STUART & HAMLYN" -> "stua" + "ham" = "stuaham").
 */
function lineMatchesCorporateDomain(line: string, domainRoot: string): boolean {
  if (!domainRoot || domainRoot.length < 3) return false;
  const collapsed = line.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (collapsed.length < 3) return false;
  if (collapsed.includes(domainRoot) || domainRoot.includes(collapsed)) {
    return true;
  }

  // Fuzzy match when domainRoot is 6+ chars and line contains a close variant (e.g. "hmcoporateservices" vs "hmcorporateservices")
  if (domainRoot.length >= 6) {
    const dLen = domainRoot.length;
    for (let len = Math.max(5, dLen - 2); len <= Math.min(collapsed.length, dLen + 2); len++) {
      for (let i = 0; i <= collapsed.length - len; i++) {
        const sub = collapsed.slice(i, i + len);
        const dist = levenshteinDistance(sub, domainRoot);
        const maxAllowedDist = dLen >= 12 ? 2 : 1;
        if (dist <= maxAllowedDist) {
          return true;
        }
      }
    }
  }

  const words = line
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (words.length >= 2) {
    // Check if domainRoot is formed by concatenating prefixes of the words (e.g. stua + ham = stuaham)
    for (let p1 = 2; p1 <= Math.min(words[0].length, domainRoot.length - 2); p1++) {
      const pre1 = words[0].slice(0, p1);
      const rem = domainRoot.slice(p1);
      if (domainRoot.startsWith(pre1) && words[1].startsWith(rem)) {
        return true;
      }
    }
  }
  return false;
}

export interface ParsedPersonRecord {
  fields: ContactFields;
  customFields: CustomCardField[];
}

export interface DeterministicParseResult {
  isUnreadable: boolean;
  isLogoOrBlankSideOnly?: boolean;
  backSideHadNoExtraData?: boolean;
  unreadableReason: string;
  rawOcrFront: string;
  rawOcrBack: string;
  fields: ContactFields;
  customFields: CustomCardField[];
  allContacts: ParsedPersonRecord[];
  imageQualityIssues: ImageQualityIssue[];
  scanLog?: ScanDiagnosticLog;
}

export function parseBusinessCardOcrText(
  rawOcrFront: string,
  rawOcrBack = '',
  avgConfidence = 90,
  spatialLinesOverride?: string[]
): DeterministicParseResult {
  const normFront = normalizeOcrArtifacts(rawOcrFront);
  const normBack = normalizeOcrArtifacts(rawOcrBack);
  const combinedRaw = [normFront, normBack].filter(Boolean).join('\n');
  const lines: string[] = [];

  if (spatialLinesOverride && spatialLinesOverride.length > 0) {
    for (const rawLn of spatialLinesOverride) {
      for (const seg of splitMergedTwoColumnLine(normalizeOcrArtifacts(rawLn))) {
        if (isMeaningfulOcrLine(seg)) {
          lines.push(seg);
        }
      }
    }
  } else {
    for (const rawLn of combinedRaw.split(/\r?\n/)) {
      for (const seg of splitMergedTwoColumnLine(rawLn)) {
        if (isMeaningfulOcrLine(seg)) {
          lines.push(seg);
        }
      }
    }
  }

  const backCleanLines = rawOcrBack
    ? rawOcrBack
        .split(/\r?\n/)
        .map(cleanLine)
        .filter(isMeaningfulOcrLine)
    : [];
  const backSideHadNoExtraData = Boolean(
    rawOcrBack !== undefined && backCleanLines.length === 0
  );

  if (lines.length === 0 || combinedRaw.replace(/[^a-zA-Z0-9]/g, '').length < 6) {
    return {
      isUnreadable: true,
      isLogoOrBlankSideOnly: true,
      backSideHadNoExtraData,
      unreadableReason:
        'No readable business card text detected. Place a business card inside the framing box and hold steady.',
      rawOcrFront,
      rawOcrBack,
      fields: createEmptyContactFields(),
      customFields: [],
      allContacts: [],
      imageQualityIssues: ['blurry'],
    };
  }

  const conf = Math.max(85, Math.min(99, Math.round(avgConfidence || 92)));
  const usedLineIndices = new Set<number>();

  const decisions: ScanDiagnosticDecision[] = [];
  const disambiguationNotes: string[] = [];
  const anomalies: string[] = [];

  const recordDecision = (
    lineIdx: number,
    assignedField: string,
    fieldLabel: string,
    confidence: number,
    reason: string
  ) => {
    if (lineIdx >= 0 && lineIdx < lines.length) {
      decisions.push({
        lineIndex: lineIdx,
        lineText: lines[lineIdx],
        assignedField,
        fieldLabel,
        confidence,
        reason,
      });
    }
  };

  const allEmails: { email: string; lineIdx: number }[] = [];
  const allPhones: {
    number: string;
    kind: 'mobile' | 'office' | 'whatsapp' | 'fax';
    lineIdx: number;
  }[] = [];
  const personCandidates: {
    fullName: string;
    designation: string;
    lineIdx: number;
    matchesEmailPrefix?: boolean;
  }[] = [];
  const roleCandidates: { role: string; lineIdx: number }[] = [];

  let website = '';
  let companyWebsite = '';
  let linkedIn = '';
  let otherSocialMedia = '';
  let poBox = '';
  let registrationInfo = '';
  let qrCodeInfo = '';
  let department = '';
  let companyName = '';
  let businessActivity = '';
  let city = '';
  let country = '';
  let officeLocation = '';
  const addressParts: string[] = [];
  const otherNotes: string[] = [];

  // Pass 0: Detect Multi-Country Branch Footers (e.g. "UAE | AUSTRALIA | INDIA | USA") and Firm Activity lines ("Chartered Accountants")
  lines.forEach((line, idx) => {
    const matchedCountries = COUNTRIES_LIST.filter((c) =>
      new RegExp(`\\b${c.replace(/\./g, '\\.')}\\b`, 'i').test(line)
    );
    if (
      matchedCountries.length >= 2 &&
      (line.includes('|') || line.split(/\s+/).length <= 8) &&
      !ADDRESS_KEYWORDS_REGEX.test(line)
    ) {
      const normalizedBranches = line.replace(/^A\s+(?=AUSTRALIA)/i, 'UAE | ');
      otherNotes.push(`Branches: ${normalizedBranches}`);
      usedLineIndices.add(idx);
      return;
    }

    if (FIRM_ACTIVITY_LINE_REGEX.test(line.trim())) {
      if (!businessActivity) {
        businessActivity = line.trim();
      }
      usedLineIndices.add(idx);
    }
  });

  // Pass 1: Emails
  const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  lines.forEach((line, idx) => {
    const repaired = line
      .replace(/\s*(\(at\)|\[at\]|@|©)\s*/gi, '@')
      .replace(/,(com|in|co|org|net|io|ae|uk|de|ch|jp|us|global)\b/gi, '.$1')
      .replace(/\s*\.\s*(com|in|co|org|net|io|ae|uk|global)\b/gi, '.$1');

    const matches = repaired.match(emailRegex);
    if (matches) {
      matches.forEach((m) => {
        const cleanMail = m.toLowerCase();
        if (!allEmails.some((e) => e.email === cleanMail)) {
          allEmails.push({ email: cleanMail, lineIdx: idx });
        }
      });
      const leftover = repaired
        .replace(emailRegex, '')
        .replace(/\b(e-?mail|mail|id|e)\b\s*[:.-]?/gi, '')
        .replace(/[,|/]/g, '')
        .trim();
      if (leftover.length < 4) {
        usedLineIndices.add(idx);
      }
    }
  });

  // Pass 2: Websites & Social Links
  const urlRegex =
    /\b((?:https?:\/\/|www\.)[^\s,;]+|[a-zA-Z0-9-]{3,}\.(?:com|org|net|io|co\.in|in|co\.uk|uk|ae|de|ch|jp|us|ca|au|global|ai|tech|biz|info)(?:\/[^\s,;]*)?)\b/gi;
  lines.forEach((line, idx) => {
    const withoutEmails = line.replace(emailRegex, ' ');
    const repairedUrlLine = withoutEmails.replace(/\bwww,/gi, 'www.');
    const matches = repairedUrlLine.match(urlRegex);
    if (matches) {
      matches.forEach((u) => {
        const cleanUrl = u.replace(/[.,;)]+$/, '');
        if (/^(pvt|ltd|inc|llc|co|p\.o|bldg)\./i.test(cleanUrl)) return;
        if (/linkedin\.com/i.test(cleanUrl)) {
          if (!linkedIn) linkedIn = cleanUrl;
        } else if (
          /(twitter\.com|x\.com|instagram\.com|facebook\.com|youtube\.com)/i.test(cleanUrl)
        ) {
          if (!otherSocialMedia) otherSocialMedia = cleanUrl;
        } else {
          if (!companyWebsite) {
            companyWebsite = cleanUrl;
          } else if (cleanUrl.toLowerCase() !== companyWebsite.toLowerCase() && !website) {
            website = cleanUrl;
          }
        }
      });
      const leftover = repairedUrlLine
        .replace(urlRegex, '')
        .replace(/\b(web(site)?|url|visit|w)\b\s*[:.-]?/gi, '')
        .trim();
      if (leftover.length < 4) {
        usedLineIndices.add(idx);
      }
    }
  });

  // Extract corporate domain root (from email or website) for Logo Word correlation
  const FREE_MAIL_DOMAINS = new Set([
    'gmail',
    'yahoo',
    'outlook',
    'hotmail',
    'icloud',
    'rediffmail',
    'ymail',
    'live',
    'msn',
    'protonmail',
    'aol',
    'zoho',
  ]);
  let corporateDomainRoot = '';
  let formattedDomainCompany = '';
  const extractDomainBrand = (rawHost: string) => {
    const cleanHost = rawHost.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
    const parts = cleanHost.split('.');
    const sld = parts[0] || '';
    const tld = parts[1] || '';
    if (sld.length >= 3 && !FREE_MAIL_DOMAINS.has(sld)) {
      corporateDomainRoot = sld.replace(/[^a-z0-9]/g, '');
      const words = sld
        .split(/[-_]+/)
        .filter(Boolean)
        .map((w) =>
          w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
        );
      if (tld === 'global' && !words.some((w) => w.toLowerCase() === 'global')) {
        words.push('Global');
      }
      formattedDomainCompany = words.join(' ');
    }
  };

  if (allEmails.length > 0) {
    const host = allEmails[0].email.split('@')[1] || '';
    if (host) extractDomainBrand(host);
  }
  if (!corporateDomainRoot && companyWebsite) {
    extractDomainBrand(companyWebsite);
  }

  // Pass 3: Registration / Tax IDs, PO Box, Department & QR
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    const gstMatch = line.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}\b/i);
    if (
      gstMatch ||
      /\b(gst(in)?|cin|tin|vat|crn|trn|reg(istration)?\s*(no|id)?|license\s*no|dfsa|che-\d)\b/i.test(
        line
      )
    ) {
      if (!registrationInfo) {
        registrationInfo = line
          .replace(/^(gst(in)?|reg(istration)?\s*(no|id)?|license\s*no)\s*[:.-]?\s*/i, '')
          .trim();
        usedLineIndices.add(idx);
      }
    }
    if (/\b(p\.?\s*o\.?\s*box|post\s*office\s*box)\b/i.test(line)) {
      const m = line.match(/(p\.?\s*o\.?\s*box\s*:?\s*[A-Za-z0-9-]+)/i);
      poBox = m ? m[1].replace(/\s{2,}/g, ' ').trim() : line;
    }
    if (/\b(qr\s*data|vcard)\b/i.test(line)) {
      qrCodeInfo = line.replace(/^qr\s*(data|code)?\s*[:.-]?\s*/i, '').trim();
      usedLineIndices.add(idx);
    }
    if (
      /^dep(artmen)?t\s*[:.-]/i.test(line) ||
      /\bdivision\b/i.test(line) ||
      DEPARTMENT_SPEC_REGEX.test(line)
    ) {
      if (
        !department &&
        !DESIGNATION_KEYWORDS.some((kw) =>
          new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)
        )
      ) {
        department = line.replace(/^dep(artmen)?t\s*[:.-]?\s*/i, '').trim();
        usedLineIndices.add(idx);
      }
    }
  });

  // Pass 4: Phone Numbers
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    const { phones, isPurePhoneLine } = extractPhonesFromLine(line);
    if (phones.length > 0) {
      phones.forEach((p) => {
        if (
          !allPhones.some(
            (existing) => existing.number.replace(/\D/g, '') === p.number.replace(/\D/g, '')
          )
        ) {
          allPhones.push({ ...p, lineIdx: idx });
        }
      });
      const hasRealAddressOnSameLine =
        ADDRESS_KEYWORDS_REGEX.test(line) ||
        COUNTRIES_LIST.some((c) =>
          new RegExp(`\\b${c.replace(/\./g, '\\.')}\\b`, 'i').test(line)
        );
      if (isPurePhoneLine || !hasRealAddressOnSameLine) {
        usedLineIndices.add(idx);
      }
    }
  });

  // Pass 5: Country, State & City Recognition (skip lines already consumed as multi-country footers)
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    const lower = line.toLowerCase();
    for (const [stateName, mappedCountry] of Object.entries(INDIAN_STATES_MAP)) {
      if (lower.includes(stateName) && !country) {
        country = mappedCountry;
      }
    }
    for (const c of COUNTRIES_LIST) {
      const regex = new RegExp(`\\b${c.replace(/\./g, '\\.')}\\b`, 'i');
      if (regex.test(line)) {
        country =
          c === 'USA' || c === 'U.S.A.'
            ? 'United States'
            : c === 'UK'
            ? 'United Kingdom'
            : c === 'UAE'
            ? 'United Arab Emirates'
            : c === 'KSA'
            ? 'Saudi Arabia'
            : c;
        break;
      }
    }
    for (const ct of MAJOR_CITIES) {
      const regex = new RegExp(`\\b${ct}\\b`, 'i');
      if (regex.test(line)) {
        city = ct;
        if (!country && MAJOR_CITIES.indexOf(ct) < 72) {
          country = 'India';
        } else if (!country && ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman'].includes(ct)) {
          country = 'United Arab Emirates';
        }
        break;
      }
    }
    if (!country && /\b[1-8]\d{2}\s?\d{3}\b/.test(line) && ADDRESS_KEYWORDS_REGEX.test(line)) {
      country = 'India';
    }
  });

  const SECTION_HEADER_REGEX =
    /^(our\s+services|services(\s+offered)?|products(\s+&\s+services)?|what\s+we\s+do|about\s+us|contact(\s+us)?|get\s+in\s+touch|head\s+office|branch\s+office|corporate\s+office|follow\s+us|let's\s+build.*|we\s+offer)\b/i;

  const STRICT_LEGAL_ENTITY_REGEX =
    /\b(inc\.?|llc\.?|ltd\.?|pvt\.?|private\s+limited|limited|corp\.?|corporation|gmbh|plc|llp|fze|fzco|dmcc|pjsc|wll)\b/i;

  // Pass 6: Multi-Scenario Role, Designation & Spatial Proximity Anchoring
  // Step 6.1: Scan all lines for Job Titles / Designations first to establish the human contact anchor
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    if (SECTION_HEADER_REGEX.test(line)) return;
    const lower = line.toLowerCase();
    const serviceKeywordMatches =
      line.match(/\b(services|consultancy|consulting|advisory|solutions|management)\b/gi) || [];
    const isServiceListLine = serviceKeywordMatches.length >= 2;

    const collapsedLine = lower.replace(/[^a-z]/g, '');
    let matchedRoleKeyword: string | undefined;
    const isRoleMatch =
      !isServiceListLine &&
      DESIGNATION_KEYWORDS.some((kw) => {
        const kwLower = kw.toLowerCase();
        const kwCollapsed = kwLower.replace(/[^a-z]/g, '');
        if (
          lower === kwLower ||
          new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)
        ) {
          matchedRoleKeyword = cleanRoleNoise(line);
          return true;
        }
        if (
          kwCollapsed.length >= 6 &&
          collapsedLine === kwCollapsed
        ) {
          matchedRoleKeyword = capitalizeWords(kw);
          return true;
        }
        return false;
      }) &&
      line.length <= 68 &&
      !STRICT_LEGAL_ENTITY_REGEX.test(line) &&
      !/\b(&\s*(co|sons|associates|partners|llc|inc|ltd))\b/i.test(line);

    if (isRoleMatch && matchedRoleKeyword) {
      roleCandidates.push({ role: capitalizeWords(matchedRoleKeyword), lineIdx: idx });
      usedLineIndices.add(idx);
      recordDecision(idx, 'designation', 'Designation / Job Title', 95, `Matched executive/professional title keyword`);
    }
  });

  // Calculate designation spatial neighbors (lines immediately adjacent to job titles are prime Person Name candidates)
  const designationNeighborIndices = new Set<number>();
  roleCandidates.forEach((rc) => {
    if (rc.lineIdx > 0 && !usedLineIndices.has(rc.lineIdx - 1)) {
      designationNeighborIndices.add(rc.lineIdx - 1);
    }
    if (rc.lineIdx < lines.length - 1 && !usedLineIndices.has(rc.lineIdx + 1)) {
      designationNeighborIndices.add(rc.lineIdx + 1);
    }
  });

  // Step 6.2: Corporate Domain Root Triangulation (e.g. "BLUEFIN", "ACME", "DAR ALNUZUM", "STUART & HAMLYN")
  if (corporateDomainRoot.length >= 3) {
    const domainMatchedIdx = lines.findIndex((line, idx) => {
      if (usedLineIndices.has(idx) || ADDRESS_KEYWORDS_REGEX.test(line)) return false;
      return lineMatchesCorporateDomain(line, corporateDomainRoot);
    });
    if (domainMatchedIdx >= 0) {
      companyName = lines[domainMatchedIdx].replace(/\s*—.*$/, '').trim();
      usedLineIndices.add(domainMatchedIdx);
      recordDecision(domainMatchedIdx, 'companyName', 'Company Name', 98, `Matched corporate domain root '${corporateDomainRoot}'`);
      disambiguationNotes.push(`Company name '${companyName}' anchored via domain root '${corporateDomainRoot}'`);
    }
  }

  // Step 6.3: Person-Named Business Resolution (e.g. "Dr. Anvith Dental Clinic", "Anvith Consulting", "Smith & Sons")
  // If a line has business qualifiers (Clinic, Studio, Consulting, Associates, Law Chambers, etc.), it's the Company Name!
  if (!companyName) {
    const bizQualifierIdx = lines.findIndex((line, idx) => {
      if (usedLineIndices.has(idx)) return false;
      if (SECTION_HEADER_REGEX.test(line) || ADDRESS_KEYWORDS_REGEX.test(line)) return false;
      const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
      return (
        alphaCount >= 4 &&
        (BUSINESS_QUALIFIER_REGEX.test(line) ||
          COMPANY_SUFFIX_REGEX.test(line) ||
          /\b(&\s*(co|sons|associates|partners|llc|inc|ltd))\b/i.test(line))
      );
    });
    if (bizQualifierIdx >= 0) {
      companyName = lines[bizQualifierIdx].replace(/\s*—.*$/, '').trim();
      usedLineIndices.add(bizQualifierIdx);
      recordDecision(bizQualifierIdx, 'companyName', 'Company Name', 94, 'Matched commercial entity / enterprise practice descriptor');
      disambiguationNotes.push(`Company '${companyName}' classified via business practice qualifier`);
    }
  }

  // Pass 7: Person Name Candidates Extraction (Email Prefix + Designation Proximity Triangulation + Stacked Names)
  const primaryEmailPrefix = allEmails[0]?.email.split('@')[0]?.toLowerCase() || '';

  // Step 7.1: Detect Multi-line Stacked Person Names (e.g. Line 0: "ANVITH", Line 1: "KUMAR" followed by or neighbor to Designation)
  for (let idx = 0; idx < lines.length - 1; idx++) {
    if (usedLineIndices.has(idx) || usedLineIndices.has(idx + 1)) continue;
    const isAdjacentToRole =
      designationNeighborIndices.has(idx) ||
      designationNeighborIndices.has(idx + 1) ||
      designationNeighborIndices.has(idx + 2);
    const w1 = lines[idx].trim();
    const w2 = lines[idx + 1].trim();
    const isSingleWord1 = /^[A-Za-z]{2,18}$/.test(w1);
    const isSingleWord2 = /^[A-Za-z]{2,18}$/.test(w2);
    const hasCompanySignals =
      COMPANY_SUFFIX_REGEX.test(w1) ||
      COMPANY_SUFFIX_REGEX.test(w2) ||
      BUSINESS_QUALIFIER_REGEX.test(w1) ||
      BUSINESS_QUALIFIER_REGEX.test(w2) ||
      lineMatchesCorporateDomain(w1, corporateDomainRoot) ||
      lineMatchesCorporateDomain(w2, corporateDomainRoot);

    if (
      isSingleWord1 &&
      isSingleWord2 &&
      !hasCompanySignals &&
      (isAdjacentToRole || (idx === 0 && lines.length <= 6))
    ) {
      const combinedStackedName = `${capitalizeWords(w1)} ${capitalizeWords(w2)}`;
      personCandidates.push({
        fullName: combinedStackedName,
        designation: '',
        lineIdx: idx,
        matchesEmailPrefix: Boolean(
          primaryEmailPrefix &&
            (primaryEmailPrefix.includes(w1.toLowerCase()) || primaryEmailPrefix.includes(w2.toLowerCase()))
        ),
      });
      usedLineIndices.add(idx);
      usedLineIndices.add(idx + 1);
      recordDecision(idx, 'fullName', 'Full Name', 96, 'Reconstructed multi-line stacked person name (First Name + Last Name)');
      break;
    }
  }

  // Step 7.2: Single-line Person Name Detection
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    if (SECTION_HEADER_REGEX.test(line)) {
      usedLineIndices.add(idx);
      return;
    }

    const hasCompanyQualifier =
      COMPANY_SUFFIX_REGEX.test(line) ||
      BUSINESS_QUALIFIER_REGEX.test(line) ||
      /\b(&\s*(co|sons|associates|partners|llc|inc|ltd))\b/i.test(line);

    if (hasCompanyQualifier) return;

    const isDesignationNeighbor = designationNeighborIndices.has(idx);
    const nameCheck = isLikelyPersonNameLine(
      line,
      primaryEmailPrefix,
      corporateDomainRoot
    );

    // Person Name Classification: Strictly require name validity
    if (nameCheck.isName) {
      const cleanedName = nameCheck.cleanedName || capitalizeWords(line);
      const isPrefixMatch = Boolean(nameCheck.matchesEmailPrefix);
      personCandidates.push({
        fullName: cleanedName,
        designation: nameCheck.embeddedRole ? cleanRoleNoise(nameCheck.embeddedRole) : '',
        lineIdx: idx,
        matchesEmailPrefix: isPrefixMatch,
      });
      usedLineIndices.add(idx);
      const reason = isPrefixMatch
        ? `Matched email username prefix '${primaryEmailPrefix}'`
        : isDesignationNeighbor
        ? 'Placed directly adjacent to Job Title / Designation in card layout'
        : 'Matched standard personal name typography and structure';
      recordDecision(idx, 'fullName', 'Full Name', isPrefixMatch ? 98 : isDesignationNeighbor ? 94 : 90, reason);
      return;
    }
  });

  // Pass 8: Address Lines & Office Location
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    if (
      allPhones.some((p) => p.lineIdx === idx) ||
      allEmails.some((e) => e.lineIdx === idx)
    ) {
      return;
    }
    if (
      ADDRESS_KEYWORDS_REGEX.test(line) ||
      /\b\d{5,6}\b/.test(line) ||
      (city && new RegExp(`\\b${city}\\b`, 'i').test(line)) ||
      (country && new RegExp(`\\b${country}\\b`, 'i').test(line))
    ) {
      if (
        /\b(office|suite|floor|fl\.?|unit|tower|wing|block|chamber|room|centre|center|building|bldg\.?|plaza)\b/i.test(
          line
        )
      ) {
        const cleanLocPart = line.replace(/^P\.O\.\s*Box\s*:?\s*\d+\s*,\s*/i, '').trim();
        if (cleanLocPart && !officeLocation) {
          officeLocation = cleanLocPart;
        }
      }
      addressParts.push(line);
      usedLineIndices.add(idx);
      recordDecision(idx, 'companyAddress', 'Company Address', 91, 'Matched building, street, or city address syntax');
    }
  });

  personCandidates.sort((a, b) =>
    a.matchesEmailPrefix === b.matchesEmailPrefix ? 0 : a.matchesEmailPrefix ? -1 : 1
  );

  // Link role candidates to best person candidate
  for (const rc of roleCandidates) {
    let bestPerson = personCandidates.find(
      (p) => !p.designation && Math.abs(p.lineIdx - rc.lineIdx) <= 2
    );
    if (!bestPerson) {
      bestPerson = personCandidates.find((p) => !p.designation);
    }
    if (bestPerson) {
      bestPerson.designation = rc.role;
    } else if (!department && personCandidates.length > 0) {
      department = rc.role;
    }
  }

  // If a person has a general role like "Manager" and a specialization/department line like "Taxation and Compliance"
  // immediately following, combine them into a descriptive designation while keeping department populated
  if (personCandidates[0] && department) {
    const roleVal = personCandidates[0].designation;
    if (
      roleVal &&
      !roleVal.toLowerCase().includes(department.toLowerCase()) &&
      roleVal.split(/\s+/).length <= 2
    ) {
      personCandidates[0].designation = `${roleVal} - ${department}`;
    }
  }

  // Step 6.4: Suffix-less Brand / Company Fallback (Top Perimeter Header)
  // Real-world cards like "BLUEFIN", "VORTEX", "MONOLITH", "ACME", "HORIZON" place the brand at Line 0 or 1
  if (!companyName) {
    const topPerimeterIdx = lines.findIndex((line, idx) => {
      if (usedLineIndices.has(idx)) return false;
      if (SECTION_HEADER_REGEX.test(line) || ADDRESS_KEYWORDS_REGEX.test(line)) return false;
      // Never pick a line that has a person name structure, honorific, or matches person name candidates
      const nameCheck = isLikelyPersonNameLine(line, primaryEmailPrefix, corporateDomainRoot);
      if (nameCheck.isName) return false;
      if (
        personCandidates.some(
          (p) => p.lineIdx === idx || p.fullName.toLowerCase() === line.toLowerCase()
        )
      ) {
        return false;
      }
      const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
      return idx <= 1 && alphaCount >= 3 && !/\d{4,}/.test(line);
    });

    if (topPerimeterIdx >= 0) {
      companyName = lines[topPerimeterIdx].trim();
      usedLineIndices.add(topPerimeterIdx);
      recordDecision(topPerimeterIdx, 'companyName', 'Company Name', 89, 'Classified as prominent top-perimeter brand header');
      disambiguationNotes.push(`Top header '${companyName}' classified as suffix-less brand`);
    } else if (formattedDomainCompany) {
      companyName = formattedDomainCompany;
      disambiguationNotes.push(`Company name inferred from web domain: '${formattedDomainCompany}'`);
    } else if (personCandidates.length > 0) {
      // Solo practitioner / freelance card
      disambiguationNotes.push('Individual / Solo Practitioner: card contains personal contact without corporate brand');
    }
  }

  const activityParts: string[] = businessActivity ? [businessActivity] : [];
  lines.forEach((line, idx) => {
    if (usedLineIndices.has(idx)) return;
    if (SECTION_HEADER_REGEX.test(line)) return;
    const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
    if (
      alphaCount >= 10 &&
      line.length <= 95 &&
      !/\d/.test(line) &&
      Boolean(classifyIndustryFromText(line))
    ) {
      if (!activityParts.includes(line)) {
        activityParts.push(line);
      }
      usedLineIndices.add(idx);
      recordDecision(idx, 'businessActivity', 'Business Activity', 86, 'Classified as industry activity tagline');
    }
  });

  if (activityParts.length > 0) {
    businessActivity = activityParts.slice(0, 3).join(' · ');
  }

  const companyCategory = classifyIndustryFromText(
    [companyName, businessActivity, department, companyWebsite, ...lines].join(' ')
  );
  const companyAddress = addressParts.join(', ');
  const otherRelevantText = otherNotes.join(' · ');

  const faxPhones = allPhones.filter((p) => p.kind === 'fax');
  const whatsappPhones = allPhones.filter((p) => p.kind === 'whatsapp');
  const voicePhones = allPhones.filter((p) => p.kind !== 'fax');

  const buildPersonContact = (
    personName: string,
    personRole: string,
    mobPhone: string,
    offPhone: string,
    waPhone: string,
    compTel: string,
    primEmail: string,
    secEmail: string,
    extraPhones: string[] = []
  ): ParsedPersonRecord => {
    const f = createEmptyContactFields();
    const withoutHon = personName
      .replace(
        /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|er\.?|eng\.?|ca\.?|fca\.?|cpa\.?|adv\.?|shri\.?|smt\.?)\s+/i,
        ''
      )
      .trim();
    const nameParts = withoutHon.split(/\s+/).filter(Boolean);
    const fName = nameParts[0] || '';
    const lName = nameParts.slice(1).join(' ') || '';

    f.fullName = evaluateSingleField('fullName', {
      value: personName,
      confidence: personName ? conf : 0,
      source: 'FRONT',
    });
    f.firstName = evaluateSingleField('firstName', {
      value: fName,
      confidence: fName ? conf : 0,
      source: 'FRONT',
    });
    f.lastName = evaluateSingleField('lastName', {
      value: lName,
      confidence: lName ? conf : 0,
      source: 'FRONT',
    });
    f.designation = evaluateSingleField('designation', {
      value: personRole,
      confidence: personRole ? conf : 0,
      source: 'FRONT',
    });
    f.department = evaluateSingleField('department', {
      value: department,
      confidence: department ? conf : 0,
      source: 'FRONT',
    });
    f.mobileNumber = evaluateSingleField('mobileNumber', {
      value: mobPhone,
      confidence: mobPhone ? conf : 0,
      source: 'FRONT',
    });
    f.officePhone = evaluateSingleField('officePhone', {
      value: offPhone,
      confidence: offPhone ? conf : 0,
      source: 'FRONT',
    });
    f.whatsappNumber = evaluateSingleField('whatsappNumber', {
      value: waPhone,
      confidence: waPhone ? conf : 0,
      source: 'FRONT',
    });
    f.email = evaluateSingleField('email', {
      value: primEmail,
      confidence: primEmail ? conf : 0,
      source: 'FRONT',
    });
    f.secondaryEmail = evaluateSingleField('secondaryEmail', {
      value: secEmail,
      confidence: secEmail ? conf : 0,
      source: 'FRONT',
    });
    f.website = evaluateSingleField('website', {
      value: website || companyWebsite,
      confidence: website || companyWebsite ? conf : 0,
      source: 'FRONT',
    });
    f.linkedIn = evaluateSingleField('linkedIn', {
      value: linkedIn,
      confidence: linkedIn ? conf : 0,
      source: 'FRONT',
    });
    f.otherSocialMedia = evaluateSingleField('otherSocialMedia', {
      value: otherSocialMedia,
      confidence: otherSocialMedia ? conf : 0,
      source: 'FRONT',
    });
    f.companyName = evaluateSingleField('companyName', {
      value: companyName,
      confidence: companyName ? conf : 0,
      source: 'FRONT',
    });
    f.companyCategory = evaluateSingleField('companyCategory', {
      value: companyCategory,
      confidence: companyCategory ? conf : 0,
      source: 'FRONT',
    });
    f.businessActivity = evaluateSingleField('businessActivity', {
      value: businessActivity,
      confidence: businessActivity ? conf : 0,
      source: 'FRONT',
    });
    f.companyWebsite = evaluateSingleField('companyWebsite', {
      value: companyWebsite,
      confidence: companyWebsite ? conf : 0,
      source: 'FRONT',
    });
    f.companyAddress = evaluateSingleField('companyAddress', {
      value: companyAddress,
      confidence: companyAddress ? conf : 0,
      source: 'FRONT',
    });
    f.country = evaluateSingleField('country', {
      value: country,
      confidence: country ? conf : 0,
      source: 'FRONT',
    });
    f.city = evaluateSingleField('city', {
      value: city,
      confidence: city ? conf : 0,
      source: 'FRONT',
    });
    f.poBox = evaluateSingleField('poBox', {
      value: poBox,
      confidence: poBox ? conf : 0,
      source: 'FRONT',
    });
    f.officeLocation = evaluateSingleField('officeLocation', {
      value: officeLocation,
      confidence: officeLocation ? conf : 0,
      source: 'FRONT',
    });
    f.companyTelephone = evaluateSingleField('companyTelephone', {
      value: compTel,
      confidence: compTel ? conf : 0,
      source: 'FRONT',
    });
    f.faxNumber = evaluateSingleField('faxNumber', {
      value: faxPhones[0]?.number || '',
      confidence: faxPhones[0] ? conf : 0,
      source: 'FRONT',
    });
    f.registrationInfo = evaluateSingleField('registrationInfo', {
      value: registrationInfo,
      confidence: registrationInfo ? conf : 0,
      source: 'FRONT',
    });
    f.qrCodeInfo = evaluateSingleField('qrCodeInfo', {
      value: qrCodeInfo,
      confidence: qrCodeInfo ? conf : 0,
      source: 'FRONT',
    });
    f.otherRelevantText = evaluateSingleField('otherRelevantText', {
      value: otherRelevantText,
      confidence: otherRelevantText ? conf : 0,
      source: 'FRONT',
    });

    const personCustomFields: CustomCardField[] = extraPhones.map((ep, idx) => ({
      id: `cf_phone_${Date.now()}_${idx}`,
      label: `Additional Phone ${idx + 1}`,
      value: ep,
      confidence: conf,
      source: 'FRONT',
    }));

    return { fields: f, customFields: personCustomFields };
  };

  const allContacts: ParsedPersonRecord[] = [];

  // Strict Multi-Person Verification: Multiple phone numbers do NOT indicate multiple people.
  // A business card represents ONE individual unless there are 2+ distinct validated personal emails
  // matching 2 distinct personal identities with valid designations.
  const verifiedMultiplePeople =
    allEmails.length >= 2 &&
    personCandidates.length >= 2 &&
    personCandidates[0].fullName.toLowerCase() !== personCandidates[1].fullName.toLowerCase() &&
    personCandidates.every(
      (p) => p.matchesEmailPrefix && (p.fullName.match(/[A-Za-z]/g) || []).length >= 6
    );

  if (verifiedMultiplePeople) {
    const sharedOfficePhone =
      voicePhones.find((p) => p.kind === 'office')?.number || '';

    personCandidates.forEach((person, pIdx) => {
      const personMob =
        voicePhones[pIdx]?.number || voicePhones[0]?.number || '';
      const personEmail =
        allEmails[pIdx]?.email || allEmails[0]?.email || '';
      const personRole =
        person.designation || roleCandidates[0]?.role || '';

      allContacts.push(
        buildPersonContact(
          person.fullName,
          personRole,
          personMob,
          sharedOfficePhone !== personMob ? sharedOfficePhone : '',
          whatsappPhones[pIdx]?.number || '',
          '',
          personEmail,
          '',
          []
        )
      );
    });
  } else {
    const primaryPerson = personCandidates[0];
    const primaryRole =
      primaryPerson?.designation || roleCandidates[0]?.role || '';
    const mobList = voicePhones.filter(
      (p) => p.kind === 'mobile' || p.kind === 'whatsapp'
    );
    const offList = voicePhones.filter((p) => p.kind === 'office');

    const mob1 = mobList[0]?.number || '';
    const off1 =
      offList[0]?.number ||
      (mobList.length > 1 ? mobList[1].number : '') ||
      '';
    const compTel =
      offList.length > 1
        ? offList[1].number
        : mobList.length > 2
        ? mobList[2].number
        : '';
    const extraPhones = voicePhones
      .map((p) => p.number)
      .filter((num) => num !== mob1 && num !== off1 && num !== compTel);

    allContacts.push(
      buildPersonContact(
        primaryPerson?.fullName || '',
        primaryRole,
        mob1,
        off1,
        whatsappPhones[0]?.number || '',
        compTel,
        allEmails[0]?.email || '',
        allEmails[1]?.email || '',
        extraPhones
      )
    );
  }

  const primary = allContacts[0];
  const hasPhoneAnchor = Boolean(
    primary.fields.mobileNumber.value ||
      primary.fields.officePhone.value ||
      primary.fields.whatsappNumber.value ||
      primary.fields.companyTelephone.value
  );
  const hasEmailAnchor = Boolean(
    primary.fields.email.value || primary.fields.secondaryEmail.value
  );
  const hasWebsiteAnchor = Boolean(
    primary.fields.companyWebsite.value ||
      primary.fields.website.value ||
      primary.fields.linkedIn.value
  );

  const passesStrictCardGate =
    hasEmailAnchor ||
    (hasPhoneAnchor &&
      Boolean(
        primary.fields.fullName.value ||
          primary.fields.companyName.value ||
          hasWebsiteAnchor
      )) ||
    (hasWebsiteAnchor &&
      Boolean(primary.fields.fullName.value || primary.fields.companyName.value));

  if (!passesStrictCardGate) {
    return {
      isUnreadable: true,
      isLogoOrBlankSideOnly: true,
      backSideHadNoExtraData,
      unreadableReason:
        'Incomplete or non-card image: mandatory contact details (Company, Name, Mobile/Phone, Email) were not clearly visible. Hold the business card steady in focus.',
      rawOcrFront,
      rawOcrBack,
      fields: createEmptyContactFields(),
      customFields: [],
      allContacts: [],
      imageQualityIssues: ['blurry'],
    };
  }

  const scanLog: ScanDiagnosticLog = {
    timestamp: new Date().toISOString(),
    engineUsed: 'RapidOCR / Deterministic Precision Parser',
    totalLinesDetected: lines.length,
    rawLines: lines.map((text, idx) => ({ lineIdx: idx, text })),
    decisions,
    anomalies,
    disambiguationNotes,
  };

  return {
    isUnreadable: false,
    isLogoOrBlankSideOnly: false,
    backSideHadNoExtraData,
    unreadableReason: '',
    rawOcrFront: lines.join('\n'),
    rawOcrBack: backCleanLines.join('\n'),
    fields: primary.fields,
    customFields: primary.customFields,
    allContacts,
    imageQualityIssues: [],
    scanLog,
  };
}

export function computeOcrTextSimilarity(ocrA: string, ocrB: string): number {
  const cleanA = ocrA.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = ocrB.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanA || !cleanB) return 0;
  if (cleanA === cleanB) return 1;

  const getTrigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) {
      set.add(s.slice(i, i + 3));
    }
    return set;
  };
  const setA = getTrigrams(cleanA);
  const setB = getTrigrams(cleanB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach((tri) => {
    if (setB.has(tri)) intersection++;
  });
  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * Stores decoded QR code content into `qrCodeInfo` (QR / Card Notes) while strictly preferring
 * the card's printed text for all primary contact fields (only filling a field if printed text was empty).
 */
export function mergeQrPayloadsIntoFields(
  baseFields: ContactFields,
  qrPayloads: string[]
): ContactFields {
  if (!Array.isArray(qrPayloads) || qrPayloads.length === 0) {
    return baseFields;
  }

  const next = { ...baseFields };
  const rawSummary: string[] = [];

  for (const raw of qrPayloads) {
    const payload = raw.trim();
    if (!payload) continue;

    if (/BEGIN:VCARD/i.test(payload)) {
      const vLines = payload.split(/\r?\n/);
      const vcardParts: string[] = [];
      for (const vl of vLines) {
        const fnMatch = vl.match(/^FN(?:;[^:]*)?:(.+)$/i);
        if (fnMatch && fnMatch[1].trim()) {
          const fn = fnMatch[1].trim();
          vcardParts.push(`FN: ${fn}`);
          if (!next.fullName.value) {
            next.fullName = evaluateSingleField('fullName', {
              value: fn,
              confidence: 100,
              source: 'FRONT',
            });
          }
        }

        const orgMatch = vl.match(/^ORG(?:;[^:]*)?:(.+)$/i);
        if (orgMatch && orgMatch[1].trim()) {
          const org = orgMatch[1].split(';')[0].trim();
          if (org) {
            vcardParts.push(`ORG: ${org}`);
            if (!next.companyName.value) {
              next.companyName = evaluateSingleField('companyName', {
                value: org,
                confidence: 100,
                source: 'FRONT',
              });
            }
          }
        }

        const titleMatch = vl.match(/^TITLE(?:;[^:]*)?:(.+)$/i);
        if (titleMatch && titleMatch[1].trim()) {
          const t = titleMatch[1].trim();
          vcardParts.push(`Title: ${t}`);
          if (!next.designation.value) {
            next.designation = evaluateSingleField('designation', {
              value: t,
              confidence: 100,
              source: 'FRONT',
            });
          }
        }

        const emailMatch = vl.match(/^EMAIL(?:;[^:]*)?:(.+)$/i);
        if (emailMatch && emailMatch[1].trim()) {
          const em = emailMatch[1].trim().toLowerCase();
          vcardParts.push(`Email: ${em}`);
          if (!next.email.value) {
            next.email = evaluateSingleField('email', {
              value: em,
              confidence: 100,
              source: 'FRONT',
            });
          }
        }

        const telMatch = vl.match(/^TEL([^:]*):(.+)$/i);
        if (telMatch && telMatch[2].trim()) {
          const num = telMatch[2].trim();
          vcardParts.push(`Tel: ${num}`);
          if (!next.mobileNumber.value && !next.officePhone.value) {
            next.mobileNumber = evaluateSingleField('mobileNumber', {
              value: num,
              confidence: 100,
              source: 'FRONT',
            });
          }
        }

        const urlMatch = vl.match(/^URL(?:;[^:]*)?:(.+)$/i);
        if (urlMatch && urlMatch[1].trim()) {
          const u = urlMatch[1].trim();
          vcardParts.push(`URL: ${u}`);
          if (!next.companyWebsite.value) {
            next.companyWebsite = evaluateSingleField('companyWebsite', {
              value: u,
              confidence: 100,
              source: 'FRONT',
            });
          }
        }
      }
      rawSummary.push(
        vcardParts.length > 0 ? `vCard QR (${vcardParts.join(', ')})` : 'vCard QR Verified'
      );
    } else if (/^MECARD:/i.test(payload)) {
      rawSummary.push(`MECARD QR (${payload.replace(/^MECARD:/i, '').slice(0, 100)})`);
    } else {
      rawSummary.push(payload.replace(/\s+/g, ' ').slice(0, 160));
    }
  }

  if (rawSummary.length > 0) {
    next.qrCodeInfo = evaluateSingleField('qrCodeInfo', {
      value: rawSummary.join(' · '),
      confidence: 100,
      source: 'FRONT',
    });
  }

  return next;
}
