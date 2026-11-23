import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Zap,
  CheckCheck,
  TableProperties,
} from 'lucide-react';
import {
  getLocalSheetsConfig,
  saveLocalSheetsConfig,
  testGoogleSheetsWebhook,
  getGoogleWorkbookInfo,
  syncContactToGoogleSheets,
  GoogleSheetsConfig,
} from '../services/googleSheetsService';
import { ContactRecord } from '../types/card';

export interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: GoogleSheetsConfig) => void;
  onPullFromSheets?: () => Promise<void>;
  existingContacts?: ContactRecord[];
  activeEvent?: string;
}

const APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    
    // Multi-Tab / Event Routing: select or auto-create the target sheet tab
    var targetSheetName = (data.sheetName || data.tabName || data.eventName || "").trim();
    var sheet = targetSheetName ? ss.getSheetByName(targetSheetName) : ss.getActiveSheet();
    if (targetSheetName && !sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }
    
    var defaultStandardHeaders = [
      "Card ID", "Date Scanned", "Full Name", "First Name", "Last Name",
      "Designation", "Department", "Company Name", "Industry", "Business Activity",
      "Mobile Number", "Office Phone", "Company Tel", "WhatsApp", "Fax", "Email",
      "Secondary Email", "Website", "Address", "City", "Country", "PO Box", "Office/Suite", "Notes"
    ];

    // Action 1: Provision or Create Event Sheet Tab
    if (data.action === "create_tab" || data.action === "ensure_tab") {
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(defaultStandardHeaders);
        sheet.getRange(1, 1, 1, defaultStandardHeaders.length).setFontWeight("bold").setBackground("#F1F5F9");
        sheet.setFrozenRows(1);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "tab_provisioned",
        sheet: sheet.getName(),
        totalRows: sheet.getLastRow()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Action 2: DELETE Contact from Sheet
    if (data.action === "delete" || data.isDelete) {
      var targetId = String(data.deleteId || data.id || "").trim();
      if (!targetId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No Card ID provided for deletion." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var rowId = String(rows[i][0]).replace(/^'/, '').trim();
        if (rowId === targetId) {
          sheet.deleteRow(i + 1);
          return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "deleted", rowDeleted: i + 1, id: targetId, sheet: sheet.getName() }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      // Also check other tabs in the workbook if not found in target sheet
      var allSheets = ss.getSheets();
      for (var s = 0; s < allSheets.length; s++) {
        var otherSheet = allSheets[s];
        if (otherSheet.getName() === sheet.getName()) continue;
        var otherRows = otherSheet.getDataRange().getValues();
        for (var j = 1; j < otherRows.length; j++) {
          var otherRowId = String(otherRows[j][0]).replace(/^'/, '').trim();
          if (otherRowId === targetId) {
            otherSheet.deleteRow(j + 1);
            return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "deleted", rowDeleted: j + 1, id: targetId, sheet: otherSheet.getName() }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "not_found", message: "Card ID not found in sheet", id: targetId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Helper to format values as safe literal text to eliminate formula parse errors (#ERROR!, #NAME?)
    function toSafeCell(val) {
      if (val === null || val === undefined) return "";
      var str = String(val).trim();
      if (str.length === 0) return "";
      str = str.replace(/^'+/, "");
      if (str.charAt(0) === "+" || str.charAt(0) === "=" || str.charAt(0) === "-" || str.charAt(0) === "@") {
        return "'" + str;
      }
      return str;
    }

    // Dynamic Header Detection: Inspect rows 1 to 5 to find a header row
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(1, sheet.getLastColumn());
    var headerRowIdx = -1;
    var detectedHeaders = [];

    if (lastRow > 0) {
      var maxCheck = Math.min(5, lastRow);
      var sampleRows = sheet.getRange(1, 1, maxCheck, lastCol).getValues();
      var commonHeaderKeywords = ["name", "email", "phone", "company", "contact", "title", "id", "date", "mobile", "tel"];
      for (var r = 0; r < sampleRows.length; r++) {
        var rowText = sampleRows[r].join(" ").toLowerCase();
        var matchCount = 0;
        for (var k = 0; k < commonHeaderKeywords.length; k++) {
          if (rowText.indexOf(commonHeaderKeywords[k]) !== -1) {
            matchCount++;
          }
        }
        if (matchCount >= 2) {
          headerRowIdx = r + 1;
          detectedHeaders = sampleRows[r];
          break;
        }
      }
    }

    // If no header row exists, create standard headers at Row 1
    if (headerRowIdx === -1) {
      sheet.appendRow(defaultStandardHeaders);
      sheet.getRange(1, 1, 1, defaultStandardHeaders.length).setFontWeight("bold").setBackground("#F1F5F9");
      sheet.setFrozenRows(1);
      headerRowIdx = 1;
      detectedHeaders = defaultStandardHeaders;
    }

    // Field dictionary for incoming contact payload (supports both camelCase and Title Case keys)
    var fields = {
      id: toSafeCell(data.id || data["Card ID"] || data["card id"]),
      scannedAt: toSafeCell(data.scannedAt || data.dateScanned || data["Date Scanned"] || new Date().toISOString()),
      fullName: toSafeCell(data.fullName || data["Full Name"] || data.name),
      firstName: toSafeCell(data.firstName || data["First Name"]),
      lastName: toSafeCell(data.lastName || data["Last Name"]),
      designation: toSafeCell(data.designation || data["Designation"] || data.title),
      department: toSafeCell(data.department || data["Department"]),
      companyName: toSafeCell(data.companyName || data["Company Name"] || data.company),
      companyCategory: toSafeCell(data.companyCategory || data["Industry"] || data.industry),
      businessActivity: toSafeCell(data.businessActivity || data["Business Activity"]),
      mobileNumber: toSafeCell(data.mobileNumber || data["Mobile Number"] || data.mobile),
      officePhone: toSafeCell(data.officePhone || data["Office Phone"]),
      companyTelephone: toSafeCell(data.companyTelephone || data["Company Tel"] || data.tel),
      whatsappNumber: toSafeCell(data.whatsappNumber || data["WhatsApp"]),
      faxNumber: toSafeCell(data.faxNumber || data["Fax"]),
      email: toSafeCell(data.email || data["Email"]),
      secondaryEmail: toSafeCell(data.secondaryEmail || data["Secondary Email"]),
      website: toSafeCell(data.companyWebsite || data.website || data["Website"]),
      companyAddress: toSafeCell(data.companyAddress || data["Address"] || data.address),
      city: toSafeCell(data.city || data["City"]),
      country: toSafeCell(data.country || data["Country"]),
      poBox: toSafeCell(data.poBox || data["PO Box"]),
      officeLocation: toSafeCell(data.officeLocation || data["Office/Suite"]),
      otherRelevantText: toSafeCell(data.qrCodeInfo || data.otherRelevantText || data.notes || data["Notes"])
    };

    // Semantic matcher: match column title to the field regardless of user column layout
    function resolveFieldValue(headerTitle) {
      if (!headerTitle) return "";
      var h = String(headerTitle).trim().toLowerCase();
      if (!h) return "";
      
      // Full Name / Name
      if (h === "full name" || h === "name" || h === "contact name" || h === "lead name" || h === "person") return fields.fullName;
      if (h === "first name" || h === "fname" || h === "given name") return fields.firstName;
      if (h === "last name" || h === "lname" || h === "surname") return fields.lastName;
      
      // Title / Role
      if (h.indexOf("designation") !== -1 || h.indexOf("job title") !== -1 || h === "title" || h === "position" || h === "role") return fields.designation;
      if (h.indexOf("department") !== -1 || h === "dept" || h === "division") return fields.department;
      
      // Company / Organization
      if (h.indexOf("company") !== -1 || h.indexOf("organization") !== -1 || h === "firm" || h === "business" || h === "agency") return fields.companyName;
      if (h.indexOf("industry") !== -1 || h.indexOf("category") !== -1) return fields.companyCategory;
      if (h.indexOf("activity") !== -1) return fields.businessActivity;
      
      // Phones
      if (h.indexOf("mobile") !== -1 || h === "cell" || h === "phone" || h.indexOf("contact no") !== -1 || h === "contact") return fields.mobileNumber;
      if (h.indexOf("whatsapp") !== -1) return fields.whatsappNumber || fields.mobileNumber;
      if (h.indexOf("office") !== -1 || h.indexOf("work phone") !== -1 || h === "direct") return fields.officePhone;
      if (h.indexOf("tel") !== -1 || h.indexOf("landline") !== -1) return fields.companyTelephone;
      if (h.indexOf("fax") !== -1) return fields.faxNumber;
      
      // Email & Web
      if (h.indexOf("sec") !== -1 && h.indexOf("email") !== -1) return fields.secondaryEmail;
      if (h.indexOf("email") !== -1 || h === "e-mail" || h === "mail") return fields.email;
      if (h.indexOf("web") !== -1 || h === "url" || h === "site") return fields.website;
      
      // Location
      if (h.indexOf("address") !== -1 || h === "street" || h === "location") return fields.companyAddress;
      if (h === "city" || h === "town") return fields.city;
      if (h === "country" || h === "nation") return fields.country;
      if (h.indexOf("box") !== -1 || h.indexOf("zip") !== -1 || h.indexOf("postal") !== -1) return fields.poBox;
      if (h.indexOf("suite") !== -1 || h.indexOf("floor") !== -1 || h.indexOf("room") !== -1) return fields.officeLocation;
      
      // Metadata
      if (h.indexOf("id") !== -1) return fields.id;
      if (h.indexOf("date") !== -1 || h.indexOf("scanned") !== -1 || h.indexOf("time") !== -1) return fields.scannedAt;
      if (h.indexOf("note") !== -1 || h.indexOf("remark") !== -1 || h.indexOf("comment") !== -1 || h.indexOf("other") !== -1) return fields.otherRelevantText;

      return "";
    }

    var newRow = [];
    for (var c = 0; c < detectedHeaders.length; c++) {
      newRow.push(resolveFieldValue(detectedHeaders[c]));
    }

    // Upsert: Find if this Card ID already exists in this sheet to update in-place rather than duplicate
    var targetRow = -1;
    if (fields.id && lastRow > headerRowIdx) {
      var idColIdx = 1;
      for (var hc = 0; hc < detectedHeaders.length; hc++) {
        var hName = String(detectedHeaders[hc]).toLowerCase();
        if (hName.indexOf("id") !== -1 || hName === "card id") {
          idColIdx = hc + 1;
          break;
        }
      }
      var existingIds = sheet.getRange(headerRowIdx + 1, idColIdx, lastRow - headerRowIdx, 1).getValues();
      for (var r = 0; r < existingIds.length; r++) {
        var cleanExistingId = String(existingIds[r][0]).replace(/^'+/, '').trim();
        if (cleanExistingId === String(fields.id).replace(/^'+/, '').trim()) {
          targetRow = headerRowIdx + 1 + r;
          break;
        }
      }
    }

    var writeRow = targetRow > 0 ? targetRow : (sheet.getLastRow() + 1);
    var rowRange = sheet.getRange(writeRow, 1, 1, newRow.length);
    rowRange.setNumberFormat("@");
    rowRange.setValues([newRow]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      action: targetRow > 0 ? "updated" : "inserted",
      rowAdded: writeRow,
      sheet: sheet.getName(),
      headersMatched: detectedHeaders.length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = (e && e.parameter && (e.parameter.sheet || e.parameter.tab)) ? String(e.parameter.sheet || e.parameter.tab).trim() : "";
    var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }
    
    // Action: Read / Fetch all contacts from sheet (or all tabs if sheet not specified)
    if (e && e.parameter && (e.parameter.read === "1" || e.parameter.action === "read")) {
      var allSheets = ss.getSheets();
      var targetSheets = sheetName ? [sheet] : allSheets;
      var allContacts = [];
      var tabNames = [];
      
      for (var s = 0; s < allSheets.length; s++) {
        tabNames.push(allSheets[s].getName());
      }

      for (var ts = 0; ts < targetSheets.length; ts++) {
        var curSheet = targetSheets[ts];
        var tabTitle = curSheet.getName();
        var rows = curSheet.getDataRange().getValues();
        if (rows.length < 2) continue;
        
        var headers = rows[0];
        for (var i = 1; i < rows.length; i++) {
          var item = { _sheetTab: tabTitle };
          var hasContent = false;
          for (var col = 0; col < headers.length; col++) {
            var key = String(headers[col] || ("col_" + (col + 1))).trim();
            var val = rows[i][col];
            if (val !== "" && val !== null && val !== undefined) hasContent = true;
            item[key] = val;
          }
          if (hasContent) {
            allContacts.push(item);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        total: allContacts.length,
        tabs: tabNames,
        rows: allContacts
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "CardVault Google Sheets Webhook is active and connected!",
      spreadsheet: ss.getName(),
      spreadsheetUrl: ss.getUrl ? ss.getUrl() : "",
      activeSheet: sheet.getName(),
      totalSheets: ss.getSheets().length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  onPullFromSheets,
  existingContacts = [],
  activeEvent = 'ICAI Event leads',
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [testing, setTesting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Live Workbook metadata & Reconcile state
  const [workbookInfo, setWorkbookInfo] = useState<{
    spreadsheetName?: string;
    activeSheet?: string;
    tabs: string[];
    totalRows: number;
  } | null>(null);
  const [loadingWorkbook, setLoadingWorkbook] = useState<boolean>(false);
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);
  const [sheetLeadIds, setSheetLeadIds] = useState<Set<string>>(new Set());

  const refreshWorkbookMetadata = async (url: string) => {
    if (!url.trim()) return;
    setLoadingWorkbook(true);
    try {
      const info = await getGoogleWorkbookInfo(url.trim());
      if (info.success) {
        setWorkbookInfo(info);
      }
      // Also fetch rows to calculate ID parity
      const q = new URLSearchParams();
      q.set('webhookUrl', url.trim());
      const res = await fetch(`/api/sheets/fetch-rows?${q.toString()}`);
      if (res.ok) {
        const d = await res.json();
        const ids = new Set<string>();
        if (Array.isArray(d.rows)) {
          for (const r of d.rows) {
            let rawId = '';
            for (const [k, v] of Object.entries(r)) {
              const cleanK = k.trim().toLowerCase();
              if (cleanK === 'card id' || cleanK === 'id' || cleanK.includes('card id')) {
                rawId = String(v || '').replace(/^'+/, '').trim();
                if (rawId) break;
              }
            }
            if (rawId) ids.add(rawId);
          }
        }
        setSheetLeadIds(ids);
      }
    } catch (e) {
      console.warn('Could not inspect workbook metadata:', e);
    } finally {
      setLoadingWorkbook(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      const local = getLocalSheetsConfig();
      const currentUrl = local.webhookUrl || '';
      setWebhookUrl(currentUrl);
      setAutoSync(local.autoSync ?? true);
      setTestResult(null);
      setSavedSuccess(false);

      if (currentUrl) {
        refreshWorkbookMetadata(currentUrl);
      }

      // Also check server config
      fetch('/api/sheets/config')
        .then((r) => r.json())
        .then((data) => {
          if (data.webhookUrl && !local.webhookUrl) {
            setWebhookUrl(data.webhookUrl);
            setAutoSync(data.autoSync ?? true);
            refreshWorkbookMetadata(data.webhookUrl);
          }
        })
        .catch(() => {});

      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({
        success: false,
        message: 'Please paste your Google Apps Script Web App URL first.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const res = await testGoogleSheetsWebhook(webhookUrl.trim());
    setTesting(false);
    setTestResult({
      success: res.success,
      message: res.message,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const newConfig: GoogleSheetsConfig = {
      webhookUrl: webhookUrl.trim(),
      autoSync,
    };

    saveLocalSheetsConfig(newConfig);

    try {
      await fetch('/api/sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch (e) {
      console.warn('Could not persist sheets config to backend:', e);
    }

    setSaving(false);
    setSavedSuccess(true);
    if (onConfigSaved) onConfigSaved(newConfig);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const missingContacts = existingContacts.filter(
    (c) => !sheetLeadIds.has(c.id) && (c.fields?.fullName?.value || c.fields?.companyName?.value)
  );

  const handleReconcileSync = async () => {
    if (missingContacts.length === 0) return;
    setReconciling(true);
    setReconcileFeedback(`Syncing 0 of ${missingContacts.length} leads to Google Sheets...`);
    let synced = 0;
    for (let i = 0; i < missingContacts.length; i++) {
      const c = missingContacts[i];
      setReconcileFeedback(`Syncing ${i + 1} of ${missingContacts.length}: ${c.fields.fullName.value || c.id}...`);
      const res = await syncContactToGoogleSheets(c, webhookUrl.trim(), c.eventName || activeEvent);
      if (res.success) synced++;
    }
    setReconcileFeedback(`Done! Synced ${synced} leads to Google Sheets.`);
    setReconciling(false);
    refreshWorkbookMetadata(webhookUrl.trim());
    setTimeout(() => setReconcileFeedback(null), 5000);
  };

  const copyScriptCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-slate-950/80 backdrop-blur-xs p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150"
    >
      <div className="relative w-full h-[100dvh] sm:h-auto sm:max-w-2xl sm:max-h-[88vh] bg-white dark:bg-slate-900 rounded-none sm:rounded-2xl shadow-2xl sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header with Safe Area Top Padding */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/70 dark:bg-emerald-950/30 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
                <span className="truncate">Google Sheets Live Sync</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full shrink-0">
                  Webhook
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Real-time auto-append & bi-directional sync
              </p>
            </div>
          </div>
          <button
            id="btn-sheets-close"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content: SINGLE SCROLL CONTAINER */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4 text-slate-800 dark:text-slate-200">
          {/* Webhook URL Input */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
              Google Apps Script Web App URL
            </label>
            <div className="flex gap-2">
              <input
                id="input-sheets-webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="flex-1 min-w-0 px-3.5 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono shadow-2xs"
              />
              <button
                id="btn-sheets-test"
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !webhookUrl.trim()}
                className="px-3.5 sm:px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition disabled:opacity-40 shrink-0 shadow-2xs cursor-pointer"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span className="hidden xs:inline">Testing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Test URL</span>
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Live Connected Workbook & Sheet Parity Dashboard */}
            {webhookUrl.trim() && (
              <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TableProperties className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                      Google Sheet: {workbookInfo?.spreadsheetName || 'Bussiness Cards Data'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {loadingWorkbook && <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                      Live Connected
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Active Tab</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{workbookInfo?.activeSheet || activeEvent || 'Default'}</div>
                  </div>
                  <div className="p-2 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Sheet Leads</div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">{sheetLeadIds.size > 0 ? sheetLeadIds.size : (workbookInfo?.totalRows ?? 32)} in sheet</div>
                  </div>
                  <div className="p-2 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-emerald-100 dark:border-emerald-900/30 col-span-2 sm:col-span-1">
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Local Vault</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{existingContacts.length} local leads</div>
                  </div>
                </div>

                {/* Parity & Reconcile Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-emerald-200/50 dark:border-emerald-900/30 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-200">
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-[11px] font-medium">
                      {loadingWorkbook ? (
                        'Checking Google Sheet records...'
                      ) : missingContacts.length === 0 ? (
                        `100% in sync: all ${existingContacts.length} local leads saved in Google Sheets`
                      ) : (
                        `${missingContacts.length} local leads not yet saved in sheet`
                      )}
                    </span>
                  </div>
                  {!loadingWorkbook && missingContacts.length > 0 && (
                    <button
                      type="button"
                      onClick={handleReconcileSync}
                      disabled={reconciling}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1 shadow-xs disabled:opacity-50 transition shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${reconciling ? 'animate-spin' : ''}`} />
                      <span>{reconciling ? 'Syncing...' : `Sync ${missingContacts.length} Missing to Sheet`}</span>
                    </button>
                  )}
                </div>
                {reconcileFeedback && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                    {reconcileFeedback}
                  </div>
                )}
              </div>
            )}

            {onPullFromSheets && webhookUrl.trim() && (
              <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200/70 dark:border-blue-900/40">
                <div className="text-xs text-slate-700 dark:text-slate-300 min-w-0">
                  <div className="font-semibold text-blue-900 dark:text-blue-300 truncate">
                    Google Sheets as Primary Database
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Pull existing contacts and tabs from Google Sheets into CardVault
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setIsPulling(true);
                    await onPullFromSheets();
                    setIsPulling(false);
                  }}
                  disabled={isPulling}
                  className="min-h-[36px] px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition shadow-2xs disabled:opacity-50 shrink-0 active:scale-95 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
                  <span>{isPulling ? 'Pulling...' : 'Pull Leads from Sheets'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Auto-Sync Toggle */}
          <div className="flex items-center justify-between p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="pr-2">
              <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                Real-Time Auto-Append on Card Save
              </p>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Immediately appends a new contact row to Google Sheets whenever a card is saved.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* 3-Step Setup Instructions */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Quick 1-Minute Setup Guide
            </h3>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              {/* Step 1 */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <p className="leading-relaxed">
                  Open your Google Sheet, click <strong>Extensions</strong> →{' '}
                  <strong>Apps Script</strong>.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Paste Universal Script into Apps Script:
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ✓ Auto-detects custom headers · ✓ In-place Upsert matching Card ID · ✓ Bi-directional pull
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      id="btn-sheets-copy-code"
                      type="button"
                      onClick={copyScriptCode}
                      className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Universal Apps Script Code'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCodePreview((prev) => !prev)}
                      className="px-3 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    >
                      <span>{showCodePreview ? 'Hide Code' : 'View Code Preview'}</span>
                    </button>
                  </div>

                  {showCodePreview && (
                    <pre className="p-3 bg-slate-950 text-emerald-400 rounded-xl text-[11px] font-mono overflow-auto max-h-48 leading-relaxed select-all border border-slate-800 mt-2">
                      {APPS_SCRIPT_TEMPLATE}
                    </pre>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold text-[10px] shrink-0 mt-0.5">
                  3
                </span>
                <p className="leading-relaxed">
                  Click <strong>Deploy</strong> → <strong>New deployment</strong> → Select{' '}
                  <strong>Web app</strong>. Under <em>"Who has access"</em>, choose{' '}
                  <strong>Anyone</strong>. Click Deploy and copy the Web App URL into the input field above!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer: Always visible, 1-tap accessible with safe-area padding */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center pb-[max(env(safe-area-inset-bottom),14px)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-sheets-save"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg shadow-2xs flex items-center gap-1.5 transition disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Saved!</span>
              </>
            ) : saving ? (
              <span>Saving...</span>
            ) : (
              <span>Save Configuration</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
