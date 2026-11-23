/**
 * ============================================================================
 * CARDVAULT - CONSOLIDATED DATA AUTO-FORMATTER & STANDARDIZER
 * ============================================================================
 * Formats mobile numbers (+971, +91, etc.), resolves formula errors (#ERROR!),
 * cleans names, emails, companies, and roles, and styles the sheet perfectly.
 *
 * HOW TO RUN:
 * 1. In your Google Sheet, open: Extensions > Apps Script
 * 2. Click [+] > Script, name it "FormatConsolidatedData"
 * 3. Paste this entire code and save (Ctrl+S)
 * 4. Select "formatConsolidatedDataSheet" from the function dropdown at top
 * 5. Click "Run" (▶)
 * ============================================================================
 */

function formatConsolidatedDataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Consolidated Data");
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert("Sheet 'Consolidated Data' not found in this spreadsheet.");
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  if (lastRow < 2) {
    Logger.log("Sheet has no data rows to format.");
    return;
  }
  
  // 1. Fetch values and raw formulas (formulas allow recovering #ERROR! cells)
  var range = sheet.getRange(1, 1, lastRow, lastCol);
  var values = range.getValues();
  var formulas = range.getFormulas();
  var headers = values[0];
  
  // Find column indices
  var colIdx = {
    name: -1,
    mobile: -1,
    email: -1,
    company: -1,
    role: -1,
    source: -1
  };
  
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").trim().toLowerCase();
    if (h === "name" || h === "full name" || h === "contact name") colIdx.name = c;
    else if (h.indexOf("mobile") !== -1 || h.indexOf("phone") !== -1 || h.indexOf("contact no") !== -1 || h === "cell") colIdx.mobile = c;
    else if (h.indexOf("email") !== -1 || h === "mail") colIdx.email = c;
    else if (h.indexOf("company") !== -1 || h.indexOf("organization") !== -1 || h === "firm") colIdx.company = c;
    else if (h.indexOf("role") !== -1 || h.indexOf("designation") !== -1 || h.indexOf("title") !== -1 || h === "position") colIdx.role = c;
    else if (h.indexOf("source") !== -1 || h === "origin") colIdx.source = c;
  }
  
  var updatedCount = 0;
  var errorsFixed = 0;
  
  // 2. Iterate each row and apply perfect formatting
  for (var r = 1; r < values.length; r++) {
    // A. Clean Name
    if (colIdx.name !== -1) {
      values[r][colIdx.name] = cleanNameString(values[r][colIdx.name]);
    }
    
    // B. Clean Email
    if (colIdx.email !== -1) {
      values[r][colIdx.email] = cleanEmailString(values[r][colIdx.email]);
    }
    
    // C. Clean Company
    if (colIdx.company !== -1) {
      values[r][colIdx.company] = cleanCompanyString(values[r][colIdx.company]);
    }
    
    // D. Clean Role
    if (colIdx.role !== -1) {
      values[r][colIdx.role] = cleanRoleString(values[r][colIdx.role]);
    }
    
    // E. Format Mobile Number & Recover #ERROR!
    if (colIdx.mobile !== -1) {
      var rawVal = values[r][colIdx.mobile];
      var rawFormula = formulas[r][colIdx.mobile];
      
      // If cell evaluated to #ERROR!, read formula text to recover raw unparsed phone
      var inputNumber = rawVal;
      if (String(rawVal) === "#ERROR!" || String(rawVal).indexOf("#") === 0) {
        if (rawFormula) {
          inputNumber = rawFormula.replace(/^=/, '').replace(/^'/, '').trim();
          errorsFixed++;
        }
      }
      
      var formattedPhone = formatPhoneNumber(inputNumber);
      values[r][colIdx.mobile] = formattedPhone;
      updatedCount++;
    }
  }
  
  // 3. Write back cleanly as Plain Text (@) to prevent any future formula syntax errors
  range.setNumberFormat("@");
  range.setValues(values);
  
  // 4. Styling & Polish
  // Freeze header row
  sheet.setFrozenRows(1);
  
  // Format Header styling
  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setFontWeight("bold");
  headerRange.setFontColor("#0F172A");
  headerRange.setBackground("#E2E8F0");
  headerRange.setHorizontalAlignment("left");
  
  // Auto-resize columns for readability
  for (var i = 1; i <= lastCol; i++) {
    sheet.autoResizeColumn(i);
    // Add comfortable padding
    var currentWidth = sheet.getColumnWidth(i);
    if (currentWidth < 120) sheet.setColumnWidth(i, 130);
    else sheet.setColumnWidth(i, currentWidth + 20);
  }
  
  var msg = "Successfully formatted " + (lastRow - 1) + " rows in 'Consolidated Data'!\n\n" +
            "• Mobile numbers standardized with country codes (+971, +91, etc.)\n" +
            "• #ERROR! formula cells recovered & resolved: " + errorsFixed + "\n" +
            "• Names, emails, companies, and roles cleaned & capitalized\n" +
            "• Column numbers locked as safe plain text (@)";
            
  Logger.log(msg);
  if (typeof SpreadsheetApp.getUi === "function") {
    try {
      SpreadsheetApp.getUi().alert("Formatting Complete", msg, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
  }
}

/**
 * Format single phone number or multiple numbers with correct country code
 */
function formatPhoneNumber(raw) {
  if (!raw) return "";
  var s = String(raw).trim();
  if (s === "" || s === "#ERROR!") return "";
  
  // Handle multiple phone numbers separated by /, comma, or semicolon
  if (s.indexOf("/") !== -1 || s.indexOf(",") !== -1 || s.indexOf(";") !== -1) {
    var parts = s.split(/[\/,;]/);
    var formattedParts = [];
    for (var i = 0; i < parts.length; i++) {
      var p = formatSingleNumberCore(parts[i].trim());
      if (p) formattedParts.push(p);
    }
    if (formattedParts.length > 0) return formattedParts.join(" / ");
  }
  
  return formatSingleNumberCore(s);
}

function formatSingleNumberCore(s) {
  if (!s) return "";
  s = String(s).trim();
  
  // Handle formula subtraction results e.g. -505868273 -> 505868273
  if (/^-\d{7,10}$/.test(s)) {
    s = s.substring(1);
  }
  
  // Extract extension e.g. ext. 122
  var ext = "";
  var extMatch = s.match(/(?:ext|extension|ex)\.?\s*(\d+)/i);
  if (extMatch) {
    ext = " Ext. " + extMatch[1];
    s = s.replace(/(?:ext|extension|ex)\.?\s*\d+/i, "").trim();
  }
  
  // Strip non-digits
  var digits = s.replace(/\D/g, "");
  if (!digits) return s;
  
  // Dummy placeholder in healthcare datasets
  if (digits === "972000000000") return "";
  
  // UAE Toll-free 800 & Shared-cost 600
  if (digits.indexOf("800") === 0) {
    if (digits.length === 7) return "+971 800 " + digits.substring(3) + ext;
    if (digits.length === 8) return "+971 800 " + digits.substring(3, 6) + " " + digits.substring(6) + ext;
    if (digits.length >= 9) return "+971 800 " + digits.substring(3, 6) + " " + digits.substring(6) + ext;
    return "+971 800 " + digits.substring(3) + ext;
  }
  if (digits.indexOf("600") === 0) {
    return "+971 600 " + digits.substring(3) + ext;
  }
  
  // Strip international call prefix 00
  if (digits.indexOf("00") === 0) {
    digits = digits.substring(2);
  }
  
  // Handle 0971 or 097-15...
  if (digits.indexOf("0971") === 0) {
    digits = digits.substring(1);
  } else if (s.indexOf("097-1") === 0) {
    digits = "971" + digits.substring(4);
  } else if (s.indexOf("97-") === 0) {
    digits = "971" + digits.substring(2);
  }
  
  // 1. UAE numbers (+971)
  if (digits.indexOf("971") === 0) {
    var sub = digits.substring(3);
    if (sub.indexOf("0") === 0) sub = sub.substring(1); // drop trunk 0
    // UAE Mobile: starts with 5 (50, 52, 54, 55, 56, 58) - 9 digits
    if (sub.length === 9 && sub.charAt(0) === "5") {
      return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
    }
    // Mobile with repeated digit from OCR (10 digits)
    if (sub.length === 10 && sub.charAt(0) === "5") {
      return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5, 9) + ext;
    }
    // Dubai Landline: starts with 4 (8 digits)
    if (sub.length === 8 && sub.charAt(0) === "4") {
      return "+971 4 " + sub.substring(1, 4) + " " + sub.substring(4) + ext;
    }
    // Other Emirates Landlines: 2, 3, 6, 7, 9 (8 digits)
    if (sub.length === 8 && "23679".indexOf(sub.charAt(0)) !== -1) {
      return "+971 " + sub.charAt(0) + " " + sub.substring(1, 4) + " " + sub.substring(4) + ext;
    }
    if (sub.length === 7) {
      return "+971 4 " + sub.substring(0, 3) + " " + sub.substring(3) + ext;
    }
    if (sub.length === 9) {
      return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
    }
    return "+971 " + sub + ext;
  }
  
  // Starts with 05 (10 digits) -> UAE mobile with trunk 0
  if (digits.indexOf("05") === 0 && digits.length === 10) {
    var sub = digits.substring(1);
    return "+971 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
  }
  
  // Starts with 5 (9 digits) -> UAE mobile
  if (digits.charAt(0) === "5" && digits.length === 9) {
    return "+971 " + digits.substring(0, 2) + " " + digits.substring(2, 5) + " " + digits.substring(5) + ext;
  }
  
  // Starts with 5 (10 digits) -> UAE mobile with repeated digit
  if (digits.charAt(0) === "5" && digits.length === 10) {
    return "+971 " + digits.substring(0, 2) + " " + digits.substring(2, 5) + " " + digits.substring(5, 9) + ext;
  }
  
  // Starts with 5 (8 digits) -> UAE mobile short
  if (digits.charAt(0) === "5" && digits.length === 8) {
    return "+971 " + digits.substring(0, 2) + " " + digits.substring(2, 5) + " " + digits.substring(5) + ext;
  }
  
  // Starts with 04 (9 digits) -> Dubai landline with trunk 0
  if (digits.indexOf("04") === 0 && digits.length === 9) {
    var sub = digits.substring(1);
    return "+971 4 " + sub.substring(1, 4) + " " + sub.substring(4) + ext;
  }
  if (digits.indexOf("04") === 0 && digits.length === 10) {
    var sub = digits.substring(1, 9);
    return "+971 4 " + sub.substring(1, 4) + " " + sub.substring(4) + ext;
  }
  
  // Starts with 4 (8 digits) -> Dubai landline
  if (digits.charAt(0) === "4" && digits.length === 8) {
    return "+971 4 " + digits.substring(1, 4) + " " + digits.substring(4) + ext;
  }
  if (digits.charAt(0) === "4" && digits.length === 7) {
    return "+971 4 " + digits.substring(0, 3) + " " + digits.substring(3) + ext;
  }
  
  // Other Emirates landlines with trunk 0 (02, 03, 06, 07, 09 - 9 digits)
  if (/^0[23679]/.test(digits) && digits.length === 9) {
    var code = digits.charAt(1);
    var sub = digits.substring(2);
    return "+971 " + code + " " + sub.substring(0, 3) + " " + sub.substring(3) + ext;
  }
  if ("23679".indexOf(digits.charAt(0)) !== -1 && digits.length === 8) {
    return "+971 " + digits.charAt(0) + " " + digits.substring(1, 4) + " " + digits.substring(4) + ext;
  }
  
  // 2. India numbers (+91)
  if (digits.indexOf("91") === 0 && (digits.length === 12 || digits.length === 11)) {
    var sub = digits.substring(2);
    if (sub.length === 10) {
      return "+91 " + sub.substring(0, 5) + " " + sub.substring(5) + ext;
    }
    return "+91 " + sub + ext;
  }
  if (digits.length === 10 && "6789".indexOf(digits.charAt(0)) !== -1) {
    return "+91 " + digits.substring(0, 5) + " " + digits.substring(5) + ext;
  }
  
  // 3. Other countries
  if (digits.indexOf("353") === 0 && digits.length === 12) { // Ireland
    var sub = digits.substring(3);
    return "+353 " + sub.substring(0, 2) + " " + sub.substring(2, 5) + " " + sub.substring(5) + ext;
  }
  if (digits.indexOf("974") === 0 && digits.length === 11) { // Qatar
    var sub = digits.substring(3);
    return "+974 " + sub.substring(0, 4) + " " + sub.substring(4) + ext;
  }
  if (digits.indexOf("965") === 0) { // Kuwait
    var sub = digits.indexOf("965") === 0 ? digits.substring(3) : digits;
    return "+965 " + sub.substring(0, 4) + " " + sub.substring(4) + ext;
  }
  if (digits.indexOf("966") === 0) { // Saudi Arabia
    return "+966 " + digits.substring(3) + ext;
  }
  
  if (s.indexOf("+") === 0) return s;
  return s;
}

/**
 * Clean & Title Case Name preserving honorifics (CA, Dr, etc.)
 */
function cleanNameString(val) {
  if (!val) return "";
  var s = String(val).trim().replace(/\s+/g, " ");
  if (!s) return "";
  
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
 * Clean Email String (lowercase, trimmed, strip extraneous markers)
 */
function cleanEmailString(val) {
  if (!val) return "";
  var s = String(val).trim().toLowerCase();
  if (s === "none" || s === "n/a" || s === "null" || s === "-" || s === "no") return "";
  s = s.replace(/^mailto:/i, "");
  s = s.replace(/^[.,;:'"<>[\]()]+|[.,;:'"<>[\]()]+$/g, "");
  return s;
}

/**
 * Clean Company String
 */
function cleanCompanyString(val) {
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
 * Clean Role String
 */
function cleanRoleString(val) {
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
