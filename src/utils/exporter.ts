import * as XLSX from 'xlsx';
import { ContactRecord } from '../types/card';

export interface SpreadsheetRow {
  'Record ID': string;
  'Event / Database': string;
  'Google Sheet Tab': string;
  'Scan Timestamp': string;
  'Verification Status': string;
  'Saved Without Core Fields': string;
  'Missing Core Fields': string;
  'Review Notes / Flags': string;
  'Full Name': string;
  'First Name': string;
  'Last Name': string;
  'Designation / Job Title': string;
  Department: string;
  'Mobile Number': string;
  'Office Phone': string;
  'WhatsApp Number': string;
  'Email Address': string;
  'Secondary Email': string;
  'Company Name': string;
  'Company Category / Industry': string;
  'Business Activity': string;
  'Company Website': string;
  'Personal Website': string;
  'LinkedIn Profile': string;
  'Other Social Media': string;
  'Company Address': string;
  City: string;
  Country: string;
  'PO Box': string;
  'Office Location': string;
  'Company Telephone': string;
  'Fax Number': string;
  'Registration Info': string;
  'QR Code Info': string;
  'Other Printed Text': string;
  'Custom Fields': string;
  'Card Sides Scanned': string;
  'OCR Confidence (%)': number;
  'Original Scan Hash': string;
  'Raw OCR Transcript (Front)': string;
  'Raw OCR Transcript (Back)': string;
}

export function contactsToSpreadsheetRows(contacts: ContactRecord[]): SpreadsheetRow[] {
  const seenIds = new Set<string>();
  const uniqueContacts = contacts.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  return uniqueContacts.map((c) => {
    const f = c.fields;
    const coreConfidences = [
      f.fullName.confidence,
      f.companyName.confidence,
      f.designation.confidence,
      Math.max(f.mobileNumber.confidence, f.officePhone.confidence),
      f.email.confidence,
    ].filter((n) => n > 0);

    const avgConfidence =
      coreConfidences.length > 0
        ? Math.round(
            coreConfidences.reduce((sum, v) => sum + v, 0) / coreConfidences.length
          )
        : 0;

    return {
      'Record ID': c.id,
      'Event / Database': c.eventName || c.sheetTab || 'Default',
      'Google Sheet Tab': c.sheetTab || c.eventName || 'Default',
      'Scan Timestamp': new Date(c.createdAt).toLocaleString(),
      'Verification Status':
        c.overallStatus === 'VERIFIED'
          ? 'Verified'
          : c.overallStatus === 'NEEDS_REVIEW'
          ? 'Needs Review'
          : 'Missing',
      'Saved Without Core Fields': c.savedWithoutCoreFields ? 'Yes (Needs Review)' : 'No',
      'Missing Core Fields': c.missingCoreFieldLabels.join(', ') || 'None',
      'Review Notes / Flags': c.reviewReasons.join(' | ') || 'All core checks passed',
      'Full Name': f.fullName.value,
      'First Name': f.firstName.value,
      'Last Name': f.lastName.value,
      'Designation / Job Title': f.designation.value,
      Department: f.department.value,
      'Mobile Number': f.mobileNumber.value,
      'Office Phone': f.officePhone.value,
      'WhatsApp Number': f.whatsappNumber.value,
      'Email Address': f.email.value,
      'Secondary Email': f.secondaryEmail.value,
      'Company Name': f.companyName.value,
      'Company Category / Industry': f.companyCategory.value,
      'Business Activity': f.businessActivity.value,
      'Company Website': f.companyWebsite.value,
      'Personal Website': f.website.value,
      'LinkedIn Profile': f.linkedIn.value,
      'Other Social Media': f.otherSocialMedia.value,
      'Company Address': f.companyAddress.value,
      City: f.city.value,
      Country: f.country.value,
      'PO Box': f.poBox.value,
      'Office Location': f.officeLocation.value,
      'Company Telephone': f.companyTelephone.value,
      'Fax Number': f.faxNumber.value,
      'Registration Info': f.registrationInfo.value,
      'QR Code Info': f.qrCodeInfo.value,
      'Other Printed Text': f.otherRelevantText.value,
      'Custom Fields': c.customFields
        .map((cf) => `${cf.label}: ${cf.value}`)
        .join('; '),
      'Card Sides Scanned': c.backImageBase64 ? 'Front & Back' : 'Front Only',
      'OCR Confidence (%)': avgConfidence,
      'Original Scan Hash': c.scanHash,
      'Raw OCR Transcript (Front)': c.rawOcrFront.replace(/\r?\n/g, ' / '),
      'Raw OCR Transcript (Back)': (c.rawOcrBack || '').replace(/\r?\n/g, ' / '),
    };
  });
}

const DEFAULT_EXCEL_COL_WIDTHS = [
  { wch: 16 }, // Record ID
  { wch: 18 }, // Event / Database
  { wch: 18 }, // Google Sheet Tab
  { wch: 22 }, // Scan Timestamp
  { wch: 16 }, // Verification Status
  { wch: 22 }, // Saved Without Core Fields
  { wch: 26 }, // Missing Core Fields
  { wch: 36 }, // Review Notes
  { wch: 24 }, // Full Name
  { wch: 16 }, // First Name
  { wch: 16 }, // Last Name
  { wch: 28 }, // Designation
  { wch: 20 }, // Department
  { wch: 20 }, // Mobile
  { wch: 20 }, // Office Phone
  { wch: 20 }, // WhatsApp
  { wch: 30 }, // Email
  { wch: 26 }, // Secondary Email
  { wch: 32 }, // Company Name
  { wch: 26 }, // Category
  { wch: 36 }, // Business Activity
  { wch: 28 }, // Company Website
  { wch: 24 }, // Personal Website
  { wch: 28 }, // LinkedIn
  { wch: 24 }, // Social Media
  { wch: 38 }, // Address
  { wch: 18 }, // City
  { wch: 18 }, // Country
  { wch: 16 }, // PO Box
  { wch: 22 }, // Office Location
  { wch: 20 }, // Telephone
  { wch: 18 }, // Fax
  { wch: 22 }, // Registration
  { wch: 26 }, // QR Code
  { wch: 30 }, // Other Text
  { wch: 28 }, // Custom Fields
  { wch: 18 }, // Sides
  { wch: 18 }, // Confidence
  { wch: 24 }, // Hash
  { wch: 45 }, // Raw Front
  { wch: 45 }, // Raw Back
];

export function exportContactsToExcel(
  contacts: ContactRecord[],
  filenamePrefix = 'CardVault_Leads',
  sheetName = 'Contacts Database'
): { filename: string; rowCount: number } {
  const rows = contactsToSpreadsheetRows(contacts);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = DEFAULT_EXCEL_COL_WIDTHS;

  const workbook = XLSX.utils.book_new();
  const safeSheetName = sheetName.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Contacts Database';
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${dateStamp}.xlsx`;
  XLSX.writeFile(workbook, filename);

  return { filename, rowCount: rows.length };
}

/**
 * Export a Multi-Tab Excel Workbook (.xlsx) where each individual event database
 * has its own dedicated worksheet tab matching Google Sheets, plus a Master tab!
 */
export function exportMultiEventWorkbookToExcel(
  contacts: ContactRecord[],
  availableEvents: string[],
  filenamePrefix = 'CardVault_MultiEvent_Leads'
): { filename: string; rowCount: number; sheetCount: number } {
  const workbook = XLSX.utils.book_new();
  let totalRows = 0;

  const eventsWithContacts = new Set<string>();
  contacts.forEach((c) => {
    eventsWithContacts.add((c.eventName || c.sheetTab || 'Default').trim());
  });
  availableEvents.forEach((e) => {
    if (e && e.trim()) eventsWithContacts.add(e.trim());
  });

  const orderedEvents = Array.from(eventsWithContacts).sort((a, b) => {
    if (a === 'Default') return -1;
    if (b === 'Default') return 1;
    return a.localeCompare(b);
  });

  orderedEvents.forEach((eventName) => {
    const eventContacts = contacts.filter(
      (c) => (c.eventName || c.sheetTab || 'Default').trim() === eventName
    );
    if (eventContacts.length > 0) {
      const rows = contactsToSpreadsheetRows(eventContacts);
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = DEFAULT_EXCEL_COL_WIDTHS;
      const safeSheetName =
        eventName.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
      totalRows += rows.length;
    }
  });

  if (workbook.SheetNames.length > 1 || contacts.length > 0) {
    const allRows = contactsToSpreadsheetRows(contacts);
    const masterWorksheet = XLSX.utils.json_to_sheet(allRows);
    masterWorksheet['!cols'] = DEFAULT_EXCEL_COL_WIDTHS;
    XLSX.utils.book_append_sheet(workbook, masterWorksheet, 'All Leads (Master)');
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${dateStamp}.xlsx`;
  XLSX.writeFile(workbook, filename);

  return { filename, rowCount: totalRows, sheetCount: workbook.SheetNames.length };
}

export function exportContactsToCSV(
  contacts: ContactRecord[],
  filenamePrefix = 'CardVault_Leads'
): { filename: string; rowCount: number } {
  const rows = contactsToSpreadsheetRows(contacts);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);

  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${dateStamp}.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, rowCount: rows.length };
}

/**
 * Generates an RFC 6350 / vCard 3.0 (.vcf) file for one or more contacts
 * so mobile users can save scanned business cards directly into their iOS/Android Phone Contacts.
 */
export function exportContactsToVCard(
  contacts: ContactRecord[],
  filenamePrefix = 'CardVault_Contacts'
): { filename: string; rowCount: number } {
  const seenIds = new Set<string>();
  const uniqueContacts = contacts.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  const vcardBlocks = uniqueContacts.map((c) => {
    const f = c.fields;
    const fullName = f.fullName.value || f.companyName.value || 'Business Contact';
    const firstName = f.firstName.value || fullName.split(/\s+/)[0] || '';
    const lastName =
      f.lastName.value || fullName.split(/\s+/).slice(1).join(' ') || '';

    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${lastName};${firstName};;;`,
      `FN:${fullName}`,
    ];

    if (f.companyName.value) {
      lines.push(
        `ORG:${f.companyName.value}${
          f.department.value ? `;${f.department.value}` : ''
        }`
      );
    }
    if (f.designation.value) {
      lines.push(`TITLE:${f.designation.value}`);
    }
    if (f.mobileNumber.value) {
      lines.push(`TEL;TYPE=CELL,VOICE:${f.mobileNumber.value}`);
    }
    if (f.officePhone.value) {
      lines.push(`TEL;TYPE=WORK,VOICE:${f.officePhone.value}`);
    }
    if (f.companyTelephone.value) {
      lines.push(`TEL;TYPE=WORK:${f.companyTelephone.value}`);
    }
    if (f.whatsappNumber.value && f.whatsappNumber.value !== f.mobileNumber.value) {
      lines.push(`TEL;TYPE=MSG:${f.whatsappNumber.value}`);
    }
    if (f.email.value) {
      lines.push(`EMAIL;TYPE=PREF,INTERNET:${f.email.value}`);
    }
    if (f.secondaryEmail.value) {
      lines.push(`EMAIL;TYPE=INTERNET:${f.secondaryEmail.value}`);
    }
    const urlVal = f.companyWebsite.value || f.website.value;
    if (urlVal) {
      lines.push(
        `URL:${/^https?:\/\//i.test(urlVal) ? urlVal : `https://${urlVal}`}`
      );
    }
    if (f.companyAddress.value || f.city.value || f.country.value) {
      lines.push(
        `ADR;TYPE=WORK:;;${(f.companyAddress.value || '').replace(/;/g, ',')};${
          f.city.value || ''
        };;${f.poBox.value || ''};${f.country.value || ''}`
      );
    }
    if (f.businessActivity.value) {
      lines.push(`NOTE:${f.businessActivity.value}`);
    }
    lines.push('END:VCARD');
    return lines.join('\r\n');
  });

  const vcfContent = vcardBlocks.join('\r\n\r\n');
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeSingleName =
    uniqueContacts.length === 1
      ? (
          uniqueContacts[0].fields.fullName.value ||
          uniqueContacts[0].fields.companyName.value ||
          'Contact'
        )
          .replace(/[^A-Za-z0-9_-]+/g, '_')
          .slice(0, 32)
      : `${filenamePrefix}_${dateStamp}`;
  const filename = `${safeSingleName}.vcf`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, rowCount: uniqueContacts.length };
}

/**
 * Formats a phone number into a direct WhatsApp chat URL (`https://wa.me/...`).
 */
export function formatWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

