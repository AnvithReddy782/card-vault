/**
 * ============================================================================
 * CARDVAULT - CONSOLIDATED DATA STYLER & PARTITION ENGINE
 * ============================================================================
 * 1. Formats all mobile numbers with country codes (+971, +91, etc.)
 * 2. Resolves formula errors (#ERROR!) and negative subtraction anomalies
 * 3. Standardizes Names, Emails, Companies, and Roles
 * 4. Applies Executive Header Colors (#1E293B), White text, and Zebra Striping
 * 5. Automatically generates TWO separate tabs:
 *      - "With Emails" (leads with verified email addresses)
 *      - "Without Emails" (leads without emails for cold calling / WhatsApp)
 * 6. Sets Plain Text (@) across numbers to prevent scientific notation (E+11)
 *
 * HOW TO RUN IN GOOGLE SHEETS:
 * 1. Open your Google Sheet ("Bussiness Cards Data")
 * 2. Click Extensions > Apps Script
 * 3. Click [+] > Script, paste this entire file, and Save (Ctrl+S)
 * 4. Select "runFullConsolidationAndPartition" from the function list at top
 * 5. Click "Run" (▶)
 * ============================================================================
 */

function runFullConsolidationAndPartition() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Consolidated Data");
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert("Error: Sheet 'Consolidated Data' was not found.");
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("Sheet 'Consolidated Data' has no data rows.");
    return;
  }
  
  // 1. Read values & raw formulas
  var range = sheet.getRange(1, 1, lastRow, lastCol);
  var values = range.getValues();
  var formulas = range.getFormulas();
  var headers = values[0];
  
  var colIdx = { name: -1, mobile: -1, email: -1, company: -1, role: -1, source: -1 };
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").trim().toLowerCase();
    if (h === "name" || h === "full name" || h === "contact name") colIdx.name = c;
    else if (h.indexOf("mobile") !== -1 || h.indexOf("phone") !== -1 || h.indexOf("contact no") !== -1 || h === "cell") colIdx.mobile = c;
    else if (h.indexOf("email") !== -1 || h === "mail") colIdx.email = c;
    else if (h.indexOf("company") !== -1 || h.indexOf("organization") !== -1 || h === "firm") colIdx.company = c;
    else if (h.indexOf("role") !== -1 || h.indexOf("designation") !== -1 || h.indexOf("title") !== -1 || h === "position") colIdx.role = c;
    else if (h.indexOf("source") !== -1 || h === "origin") colIdx.source = c;
  }
  
  var cleanedRows = [];
  var withEmailsRows = [];
  var withoutEmailsRows = [];
  
  var standardHeaderList = ["Name", "Mobile Number", "Email", "Company", "Role", "Source"];
  
  for (var r = 1; r < values.length; r++) {
    var rawName = colIdx.name !== -1 ? values[r][colIdx.name] : "";
    var rawMob = colIdx.mobile !== -1 ? values[r][colIdx.mobile] : "";
    var rawMobFormula = colIdx.mobile !== -1 ? formulas[r][colIdx.mobile] : "";
    var rawEmail = colIdx.email !== -1 ? values[r][colIdx.email] : "";
    var rawComp = colIdx.company !== -1 ? values[r][colIdx.company] : "";
    var rawRole = colIdx.role !== -1 ? values[r][colIdx.role] : "";
    var rawSrc = colIdx.source !== -1 ? values[r][colIdx.source] : "";
    
    // Recover formula syntax errors
    var phoneInput = rawMob;
    if (String(rawMob) === "#ERROR!" || String(rawMob).indexOf("#") === 0) {
      if (rawMobFormula) {
        phoneInput = rawMobFormula.replace(/^=/, '').replace(/^'/, '').trim();
      } else {
        phoneInput = "";
      }
    }
    
    var clEmail = cleanEmailStr(rawEmail);
    var clName = cleanNameStr(rawName, rawComp);
    var clMob = formatPhoneNumberStr(phoneInput);
    var clComp = cleanCompanyStr(rawComp);
    var clRole = cleanRoleStr(rawRole);
    var clSrc = String(rawSrc || "").trim();
    
    var rowData = [clName, clMob, clEmail, clComp, clRole, clSrc];
    cleanedRows.push(rowData);
    
    if (clEmail && clEmail !== "") {
      withEmailsRows.push(rowData);
    } else {
      withoutEmailsRows.push(rowData);
    }
  }
  
  // 2. Format and style "Consolidated Data"
  sheet.clearContents();
  sheet.clearFormats();
  
  var fullOutput = [standardHeaderList].concat(cleanedRows);
  var targetRange = sheet.getRange(1, 1, fullOutput.length, standardHeaderList.length);
  targetRange.setNumberFormat("@");
  targetRange.setValues(fullOutput);
  applyExecutiveStyling(sheet, fullOutput.length, standardHeaderList.length, "#1E293B", "#2563EB");
  
  // 3. Create or update "With Emails" tab
  var withEmailsSheet = ss.getSheetByName("With Emails");
  if (!withEmailsSheet) {
    withEmailsSheet = ss.insertSheet("With Emails");
  }
  withEmailsSheet.clearContents();
  withEmailsSheet.clearFormats();
  var withOutput = [standardHeaderList].concat(withEmailsRows);
  var withRange = withEmailsSheet.getRange(1, 1, withOutput.length, standardHeaderList.length);
  withRange.setNumberFormat("@");
  withRange.setValues(withOutput);
  applyExecutiveStyling(withEmailsSheet, withOutput.length, standardHeaderList.length, "#0F766E", "#10B981"); // Deep Teal / Emerald
  
  // 4. Create or update "Without Emails" tab
  var withoutEmailsSheet = ss.getSheetByName("Without Emails");
  if (!withoutEmailsSheet) {
    withoutEmailsSheet = ss.insertSheet("Without Emails");
  }
  withoutEmailsSheet.clearContents();
  withoutEmailsSheet.clearFormats();
  var withoutOutput = [standardHeaderList].concat(withoutEmailsRows);
  var withoutRange = withoutEmailsSheet.getRange(1, 1, withoutOutput.length, standardHeaderList.length);
  withoutRange.setNumberFormat("@");
  withoutRange.setValues(withoutOutput);
  applyExecutiveStyling(withoutEmailsSheet, withoutOutput.length, standardHeaderList.length, "#92400E", "#F59E0B"); // Deep Amber
  
  // Alert completion summary
  var summaryMsg = "Consolidation & Partition Complete!\n\n" +
                   "• 'Consolidated Data': " + cleanedRows.length + " total rows (Executive Navy)\n" +
                   "• 'With Emails': " + withEmailsRows.length + " rows (Emerald Green)\n" +
                   "• 'Without Emails': " + withoutEmailsRows.length + " rows (Amber Orange)\n\n" +
                   "All phone numbers standardized with +971, +91, headers styled with colors, and locked as Plain Text (@).";
  
  Logger.log(summaryMsg);
  try {
    SpreadsheetApp.getUi().alert("Success", summaryMsg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}

/**
 * Apply Premium Executive Header Design, Frozen Panes, and Alternating Zebra Rows
 */
function applyExecutiveStyling(targetSheet, totalRows, totalCols, headerBgColor, tabColor) {
  targetSheet.setFrozenRows(1);
  if (targetSheet.setTabColor) {
    try { targetSheet.setTabColor(tabColor); } catch (e) {}
  }
  
  // Header Style
  var headerRange = targetSheet.getRange(1, 1, 1, totalCols);
  headerRange.setFontWeight("bold");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setBackground(headerBgColor);
  headerRange.setFontSize(10);
  headerRange.setFontFamily("Segoe UI");
  headerRange.setVerticalAlignment("middle");
  targetSheet.setRowHeight(1, 32);
  
  // Zebra Striping on Data Rows
  if (totalRows > 1) {
    var dataRange = targetSheet.getRange(2, 1, totalRows - 1, totalCols);
    dataRange.setFontFamily("Segoe UI");
    dataRange.setFontSize(10);
    dataRange.setFontColor("#0F172A");
    dataRange.setVerticalAlignment("middle");
    
    for (var r = 2; r <= totalRows; r++) {
      var rowRange = targetSheet.getRange(r, 1, 1, totalCols);
      targetSheet.setRowHeight(r, 22);
      if (r % 2 === 0) {
        rowRange.setBackground("#FFFFFF");
      } else {
        rowRange.setBackground("#F8FAFC"); // Subtle Slate Tint
      }
    }
  }
  
  // Column Sizing with Padding
  for (var col = 1; col <= totalCols; col++) {
    targetSheet.autoResizeColumn(col);
    var w = targetSheet.getColumnWidth(col);
    if (w < 130) targetSheet.setColumnWidth(col, 140);
    else targetSheet.setColumnWidth(col, w + 24);
  }
}

/**
 * Clean & Standardize Phone Numbers (+971, +91, etc.)
 */
function formatPhoneNumberStr(raw) {
  if (!raw) return "";
  var s = String(raw).trim();
  if (!s || s === "#ERROR!") return "";
  
  // Recover negative math subtraction anomalies e.g. -505868273
  if (/^-\d{7,10}$/.test(s)) s = s.substring(1);
  
  if (s.indexOf("/") !== -1 || s.indexOf(",") !== -1 || s.indexOf(";") !== -1) {
    var parts = s.split(/[\/,;]/);
    var formattedParts = [];
    for (var i = 0; i < parts.length; i++) {
      var p = formatSinglePhoneCore(parts[i].trim());
      if (p) formattedParts.push(p);
    }
    if (formattedParts.length > 0) return formattedParts.join(" / ");
  }
  return formatSinglePhoneCore(s);
}

function formatSinglePhoneCore(s) {
  if (!s) return "";
  s = String(s).trim();
  if (s === "972000000000") return "";
  
  var ext = "";
  var extMatch = s.match(/(?:ext|extension|ex)\.?\s*(\d+)/i);
  if (extMatch) {
    ext = " Ext. " + extMatch[1];
    s = s.replace(/(?:ext|extension|ex)\.?\s*\d+/i, "").trim();
  }
  
  var digits = s.replace(/\D/g, "");
  if (!digits) return s;
  
  // Toll-free 800 & Business 600
  if (digits.indexOf("800") === 0) {
    if (digits.length === 7) return "+971 800 " + digits.substring(3) + ext;
    if (digits.length >= 8) return "+971 800 " + digits.substring(3, 6) + " " + digits.substring(6) + ext;
  }
  if (digits.indexOf("600") === 0) return "+971 600 " + digits.substring(3) + ext;
  
  if (digits.indexOf("00") === 0) digits = digits.substring(2);
  if (digits.indexOf("0971") === 0) digits = digits.substring(1);
  else if (s.indexOf("097-1") === 0) digits = "971" + digits.substring(4);
  else if (s.indexOf("97-") === 0) digits = "971" + digits.substring(2);
  
  // UAE (+971)
  if (digits.indexOf("971") === 0) {
    var sub = digits.substring(3);
    if (sub.indexOf("0") === 0) sub = sub.substring(1);
    if (sub.length === 9 && sub.charAt(0) === "5") {
      return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
    }
    if (sub.length === 10 && sub.charAt(0) === "5") {
      return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5, 9) + ext;
    }
    if (sub.length === 8 && sub.charAt(0) === "4") {
      return "+971 4 " + sub.substring(1, 4) + " " + sub.substring(4) + ext;
    }
    if (sub.length === 8 && "23679".indexOf(sub.charAt(0)) !== -1) {
      return "+971 " + sub.charAt(0) + " " + sub.substring(1, 4) + " " + sub.substring(4) + ext;
    }
    if (sub.length === 7) return "+971 4 " + sub.substring(0, 3) + " " + sub.substring(3) + ext;
    if (sub.length === 9) return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
    return "+971 " + sub + ext;
  }
  
  if (digits.indexOf("05") === 0 && digits.length === 10) {
    var sub = digits.substring(1);
    return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
  }
  if (digits.charAt(0) === "5" && digits.length === 9) {
    return "+971 " + digits.substring(0, 2) + " " + digits.substring(2, 5) + " " + digits.substring(5) + ext;
  }
  if (digits.charAt(0) === "5" && digits.length === 10) {
    return "+971 " + digits.substring(0, 2) + " " + digits.substring(2, 5) + " " + digits.substring(5, 9) + ext;
  }
  if (digits.indexOf("04") === 0 && digits.length === 9) {
    return "+971 4 " + digits.substring(2, 5) + " " + digits.substring(5) + ext;
  }
  if (digits.charAt(0) === "4" && digits.length === 8) {
    return "+971 4 " + digits.substring(1, 4) + " " + digits.substring(4) + ext;
  }
  if (digits.charAt(0) === "4" && digits.length === 7) {
    return "+971 4 " + digits.substring(0, 3) + " " + digits.substring(3) + ext;
  }
  if (/^0[23679]/.test(digits) && digits.length === 9) {
    return "+971 " + digits.charAt(1) + " " + digits.substring(2, 5) + " " + digits.substring(5) + ext;
  }
  if ("23679".indexOf(digits.charAt(0)) !== -1 && digits.length === 8) {
    return "+971 " + digits.charAt(0) + " " + digits.substring(1, 4) + " " + digits.substring(4) + ext;
  }
  
  // India (+91)
  if (digits.indexOf("91") === 0 && (digits.length === 12 || digits.length === 11)) {
    var sub = digits.substring(2);
    if (sub.length === 10) return "+91 " + sub.substring(0, 5) + " " + sub.substring(5) + ext;
    return "+91 " + sub + ext;
  }
  if (digits.length === 10 && "6789".indexOf(digits.charAt(0)) !== -1) {
    return "+91 " + digits.substring(0, 5) + " " + digits.substring(5) + ext;
  }
  
  // Other countries
  if (digits.indexOf("353") === 0 && digits.length === 12) {
    var sub = digits.substring(3);
    return "+353 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
  }
  if (digits.indexOf("974") === 0 && digits.length === 11) {
    return "+974 " + digits.substring(3, 7) + " " + digits.substring(7) + ext;
  }
  if (digits.indexOf("965") === 0) return "+965 " + (digits.indexOf("965") === 0 ? digits.substring(3) : digits) + ext;
  if (digits.indexOf("966") === 0) return "+966 " + digits.substring(3) + ext;
  
  if (s.indexOf("+") === 0) return s;
  return s;
}

/**
 * Clean & Title Case Name
 */
function cleanNameStr(val, comp) {
  var s = String(val || "").trim().replace(/\s+/g, " ");
  if (!s) {
    if (comp && String(comp).trim()) return cleanCompanyStr(comp);
    return "Unspecified Contact";
  }
  var isAllUpper = (s === s.toUpperCase());
  var isAllLower = (s === s.toLowerCase());
  var words = s.split(" ");
  var fixed = [];
  var honorifics = { "CA": true, "DR": true, "DR.": true, "MR": true, "MR.": true, "MS": true, "MS.": true, "MD": true, "CEO": true, "CFO": true, "COO": true, "CTO": true, "LLC": true, "FZCO": true, "T": true, "B": true, "M": true, "G": true, "CH": true, "S": true };
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    var up = w.toUpperCase();
    if (honorifics[up]) {
      fixed.push((w.length <= 3 && w.indexOf(".") === -1) ? up : (up.charAt(0) + up.substring(1).toLowerCase()));
    } else if (isAllUpper || isAllLower) {
      fixed.push(w.charAt(0).toUpperCase() + w.substring(1).toLowerCase());
    } else {
      fixed.push(w);
    }
  }
  return fixed.join(" ");
}

/**
 * Clean Email
 */
function cleanEmailStr(val) {
  if (!val) return "";
  var s = String(val).trim().toLowerCase();
  if (s === "none" || s === "n/a" || s === "null" || s === "-" || s === "no") return "";
  s = s.replace(/^mailto:/i, "").replace(/^[.,;:'"<>[\]()]+|[.,;:'"<>[\]()]+$/g, "");
  if (s.indexOf(",") !== -1 || s.indexOf(";") !== -1 || s.indexOf(" ") !== -1) {
    var parts = s.split(/[,;\s]+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf("@") !== -1) {
        s = parts[i];
        break;
      }
    }
  }
  if (s === "ankit.mehta@nanauditingcom") return "ankit.mehta@nanauditing.com";
  if (s === "rakeshesupply-masters.com") return "rakesh@esupply-masters.com";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

/**
 * Clean Company
 */
function cleanCompanyStr(val) {
  if (!val) return "";
  var s = String(val).trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    var words = s.split(" ");
    var fixed = [];
    var acronyms = { "LLC": true, "FZCO": true, "FZE": true, "PJSC": true, "DMCC": true, "IT": true, "AI": true, "UAE": true, "USA": true, "UK": true };
    for (var i = 0; i < words.length; i++) {
      var up = words[i].toUpperCase();
      if (acronyms[up]) fixed.push(up);
      else fixed.push(words[i].charAt(0).toUpperCase() + words[i].substring(1).toLowerCase());
    }
    return fixed.join(" ");
  }
  return s;
}

/**
 * Clean Role
 */
function cleanRoleStr(val) {
  if (!val) return "";
  var s = String(val).trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.replace(/\w\S*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }
  return s;
}
