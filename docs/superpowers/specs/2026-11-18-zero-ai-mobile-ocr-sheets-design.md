# CardVault: Zero-AI High-Precision Mobile OCR & Google Sheets Live Sync Design

**Goal**: Deliver a 100% free, zero-cloud-cost, local-only business card scanner that runs smoothly on mobile web, extracts contact data with maximum deterministic accuracy, and automatically appends every scanned card into a Google Sheet in real time via a lightweight Webhook.

---

## 1. Core Architectural Pillars

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MOBILE WEBCAM / UPLOAD                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. LOCAL COMPUTER VISION & PRE-PROCESSOR (Edge / Canvas)               │
│    • Perspective rectangle detection with +2% outward safety margin   │
│    • Illumination leveling: subtracts background shadow gradients      │
│    • Dual-pass adaptive Otsu binarization for watermark lift           │
│    • QR code decoded via jsQR -> direct vCard auto-fill               │
│    • QR square masked in white -> zero OCR noise                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. LOCAL MULTI-PASS TESSERACT & SPATIAL COLUMN CLUSTERING              │
│    • 100% offline local traineddata (/tessdata/eng.traineddata)        │
│    • Pass A: RGB 300-DPI (PSM 3 full layout segmentation)              │
│    • Pass B: Inverted high-contrast pass for dark card stock           │
│    • Spatial clustering: groups words into horizontal baselines and    │
│      partitions by column X-gutters (prevents multi-column merging)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. ZERO-AI DETERMINISTIC SEMANTIC ENTITY EXTRACTOR                     │
│    • Phone Classifier: Mobile vs Office Tel 1 & 2 vs Fax vs WhatsApp   │
│    • Email Parser: RFC 5322 regex + OCR artifact repair (.corn->.com)  │
│    • Lexicon Classifier: 150+ designation keywords + credentials (CA)  │
│    • Company & Address Parser: Legal suffixes, P.O. Box, City, Country │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. REAL-TIME GOOGLE SHEETS WEBHOOK SYNC                                │
│    • Background auto-append on card save (Option A)                    │
│    • Lightweight Google Apps Script Webhook (Zero OAuth setup)         │
│    • On-demand "Sync All Existing Contacts" backfill button            │
│    • Full offline queue & sync retry mechanism                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Subsystem Specifications

### Subsystem 1: Computer Vision & Local OCR Pipeline (Zero Cloud / Zero Cost)
1. **Edge Card Boundary & Safety Margins**:
   - Locates the business card paper island within mobile portrait camera frames (`9:16`).
   - Applies an outward **+2% safety margin** to prevent clipping edge letters (e.g. initial letters of company names or trailing digits).
2. **Illumination Normalization**:
   - Calculates local luminance across a $32\times32$ grid to eliminate phone shadows cast by hands or overhead lighting.
   - Divides source image by estimated background illumination to level contrast.
3. **QR Code Masking & Instant vCard Auto-Fill**:
   - Decodes any QR code present via `jsQR` and native `BarcodeDetector`.
   - If the QR contains a vCard (`BEGIN:VCARD`), automatically populates all available contact fields with 100% mathematical precision.
   - Masks the QR bounding box in pure white before feeding to OCR so QR modules never generate pseudo-text words (e.g., `"ay anes"`).
4. **Local Multi-Pass Tesseract Engine**:
   - Bundles `eng.traineddata` locally at `/tessdata/eng.traineddata` (zero CDN dependencies).
   - Runs Primary Pass A on natural RGB image, and Secondary Pass B on contrast-boosted binary image if mandatory fields are missing.
5. **Spatial Baseline & Multi-Column Reconstruction**:
   - Word bounding boxes are clustered into lines based on baseline $Y \pm \Delta y$.
   - Identifies column gutters (significant horizontal gaps between words on the same baseline) and separates Left Column (e.g., Company Header) from Right Column (e.g., Name + Role).

---

### Subsystem 2: Deterministic Semantic Entity Extractor
1. **Phone Number Classification**:
   - Normalizes OCR confusion characters (`O`/`o` $\rightarrow$ `0`, `I`/`l`/`|` $\rightarrow$ `1`).
   - Categorizes phone lines by label prefixes and number formats:
     - **Mobile**: Tagged `M:`, `Mob:`, `Cell:`, or starting with mobile prefixes (e.g., `+971 50`, `+971 55`, `+91 9...`).
     - **Office Landline 1**: Tagged `T:`, `Tel:`, `Office:`, `Direct:` (e.g., `+971 4 295 1191`).
     - **Office Landline 2 / Company Telephone**: Secondary landline if multiple are present.
     - **Fax**: Tagged `F:`, `Fax:`.
     - **WhatsApp**: Tagged `WA:`, `WhatsApp:`, or matching mobile.
2. **Email & Website Normalization**:
   - Validates email format with strict domain checks and auto-repairs common OCR misreads (e.g., `mahesh@stuaham,com` $\rightarrow$ `mahesh@stuaham.com`, `.corn` $\rightarrow$ `.com`).
   - Extracts company domain and personal websites.
3. **Name, Credentials & Professional Designations**:
   - Recognizes professional prefixes and credentials (`CA.`, `FCA`, `CPA`, `ACCA`, `Dr.`, `Eng.`, `Adv.`).
   - Matches roles against an expanded 150+ keyword dictionary (`Manager`, `Director`, `Senior Partner`, `Taxation and Compliance`).
4. **Company & Physical Address**:
   - Extracts `P.O. Box: XXXXX`, building, floor, office suite, city, and country.

---

### Subsystem 3: Mobile-First UX & Viewfinder Ergonomics
1. **Viewfinder & Guide**:
   - Proportional 1.58:1 card aspect frame centered in portrait viewport.
   - Optical stability tracker: 3 consecutive steady frames (~450ms) triggers auto-capture lock.
2. **Bottom Thumb Deck**:
   - Control buttons placed strictly within the bottom thumb reach zone ($\ge 48\text{px}$ touch targets):
     - Primary **Capture Card Now** button ($52\text{px}$ height).
     - **Flash + Snap** instant burst capture.
     - Quick toggles: **Flash (`Auto` / `Torch` / `Fill Ring` / `Off`)**, **1-Sided / 2-Sided**, **Upload Photo**, **Chime (`On` / `Mute`)**.
3. **Audio & Visual Feedback**:
   - Clean chime-only sound on capture and save (no spoken synthetic voice).
   - On-spot immediate result card freeze with green verified field badges.

---

### Subsystem 4: Google Sheets Real-Time Webhook Sync
1. **Configuration UI & Interactive Guide**:
   - Dedicated **Google Sheets Settings Modal** accessible from the header bar and export view.
   - Input field for **Google Apps Script Webhook URL** with a "Test Connection" button.
   - In-app copyable 15-line Google Apps Script template for the user's spreadsheet.
2. **Option A (Real-Time Background Auto-Append)**:
   - When a card is saved (auto-saved or manually verified), CardVault asynchronously dispatches a `POST` request to the Webhook URL.
   - Appends all 18 standard CRM columns:
     `ID`, `Timestamp`, `Full Name`, `First Name`, `Last Name`, `Designation`, `Department`, `Company Name`, `Industry Category`, `Mobile Number`, `Office Phone`, `Company Telephone`, `Email`, `Website`, `Company Address`, `City`, `Country`, `PO Box`, `QR Notes`.
3. **Automatic Header Creation**:
   - The Apps Script automatically creates the header row with frozen headers and bold styling if the sheet is empty.
4. **Offline Queue & Batch Sync**:
   - If mobile is offline or network fails, sync tasks queue into IndexedDB with status `PENDING_SHEET_SYNC`.
   - "Sync All to Google Sheets" button backfills all historical records in one click.

---

## 3. Data Schema & Webhook Payload

```typescript
export interface GoogleSheetsContactPayload {
  id: string;
  scannedAt: string;
  fullName: string;
  firstName: string;
  lastName: string;
  designation: string;
  department: string;
  companyName: string;
  companyCategory: string;
  businessActivity: string;
  mobileNumber: string;
  officePhone: string;
  companyTelephone: string;
  whatsappNumber: string;
  email: string;
  secondaryEmail: string;
  website: string;
  companyWebsite: string;
  companyAddress: string;
  city: string;
  country: string;
  poBox: string;
  officeLocation: string;
  qrCodeInfo: string;
  otherRelevantText: string;
}
```

---

## 4. Google Apps Script Template

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Auto-create headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Card ID", "Date Scanned", "Full Name", "First Name", "Last Name",
        "Designation", "Department", "Company Name", "Industry", "Business Activity",
        "Mobile Number", "Office Phone", "Company Tel", "WhatsApp", "Email",
        "Secondary Email", "Website", "Address", "City", "Country", "PO Box", "Office/Suite", "Notes"
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#F1F5F9");
      sheet.setFrozenRows(1);
    }
    
    var row = [
      data.id || "",
      data.scannedAt || new Date().toISOString(),
      data.fullName || "",
      data.firstName || "",
      data.lastName || "",
      data.designation || "",
      data.department || "",
      data.companyName || "",
      data.companyCategory || "",
      data.businessActivity || "",
      data.mobileNumber || "",
      data.officePhone || "",
      data.companyTelephone || "",
      data.whatsappNumber || "",
      data.email || "",
      data.secondaryEmail || "",
      data.companyWebsite || data.website || "",
      data.companyAddress || "",
      data.city || "",
      data.country || "",
      data.poBox || "",
      data.officeLocation || "",
      data.qrCodeInfo || data.otherRelevantText || ""
    ];
    
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", rowAdded: sheet.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 5. Verification Plan
1. **Zero-AI Verification**: Run card extraction with no API key and confirm 100% local execution using local `eng.traineddata`.
2. **Mobile Layout Verification**: Verify responsiveness, bottom thumb controls, and camera viewfinder behavior via headless browser testing.
3. **Webhook Verification**: Test webhook dispatcher endpoint with mock and live Google Sheets webhook endpoints to verify row appending and error handling.
