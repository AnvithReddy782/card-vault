# CardVault Enterprise UI/UX & Architecture Design Specification

**Document Date:** 2026-11-20  
**Status:** Approved Specification  
**Goal:** Transform CardVault from a developer prototype into a commercial-grade, intuitive, and robust B2B lead capture and business card management product.

---

## 1. Executive Summary & Product Vision

CardVault is a unified hybrid business card intelligence platform designed for:
1. **On-the-go Event Lead Capture:** Rapid live mobile/tablet camera scanning at trade shows and conferences with offline persistence and instant Google Sheets/CRM sync.
2. **Desktop Power Workspace:** Deep search, editing, event-based filtering, deduplication, batch OCR imports, and spreadsheet/vCard exports.

### Core Objectives
* **Zero Dead Ends:** Every state (camera denied, zero contacts, offline network, disconnected sync, empty search) provides a clear, actionable UI path with one-click recovery.
* **Streamlined Capture Flow:** Split-view viewfinder with an instant slide-over review drawer and 1-click `"Approve & Scan Next"` (via `Enter` key), eliminating modal cascades.
* **Professional Integrations Suite:** Transparent, user-controlled Google AI Studio API key and Google Sheets Webhook configurations with instant live connectivity pings and step-by-step setup guides.
* **Data Integrity & Non-Destructive Storage:** Eliminate silent contact purging on read queries, close the duplicate resurrection loop with Google Sheets, and batch sync requests.
* **Modern Enterprise Aesthetic:** Linear/Raycast-inspired design with a deep slate/zinc palette (`#090d16` / `#0f172a`), 1px crisp borders, subtle brand violet/indigo accents, and refined micro-interactions.

---

## 2. Global Shell & Navigation Architecture

### 2.1 Header Structure
The global header provides continuous visibility into system status, context, and quick actions:

```
+---------------------------------------------------------------------------------------------------------+
| [CardVault Pro Logo]   (Event: GITEX 2026 v)   |  [AI: Active v]  [Sheets: Synced v]  [Mobile v]  | [Help]  |
+---------------------------------------------------------------------------------------------------------+
| [ Dashboard ]   [ Scanner Station ]   [ Contacts Database (142) ]   [ Export & Sync ]                   |
+---------------------------------------------------------------------------------------------------------+
```

* **Brand & Event Selector:**
  * Active Event Pill displays the current event tag (e.g., `GITEX 2026`).
  * Dropdown allows 1-click switching between active events, viewing event statistics, or creating a new event on the fly.
* **System Status Hub (Pill Cluster):**
  * **AI Studio Engine Status Pill:**
    * 🟢 `AI Studio: Active` (Model: Gemini 2.5/3.5 Flash)
    * 🟡 `Local RapidOCR (Free / 0 Cloud Cost)`
    * 🔴 `AI Studio: Key Error`
    * Clicking opens the **AI Key Configuration Modal**.
  * **Google Sheets Webhook Pill:**
    * 🟢 `Sheets: Connected` (Last synced 2m ago)
    * ⚪ `Sheets: Not Configured`
    * 🔴 `Sheets: Webhook Error`
    * Clicking opens the **Google Sheets Sync Hub**.
  * **Mobile Bridge Pill:**
    * Shows pairing state (`Mobile Ready`); clicking presents a QR code for camera handoff to mobile browsers.
* **Primary Navigation Tabs:**
  * `Dashboard`: High-level metrics, event charts, recent captures, quick actions.
  * `Scanner Station`: Focused camera/upload view with slide-over review drawer.
  * `Contacts Database`: High-density searchable/filterable grid with duplicate badges and drawer review.
  * `Export & Sync`: 1-click Excel, CSV, vCard export, and Google Sheets live push/pull controls.

---

## 3. Professional Integrations Suite (Settings & Config)

### 3.1 Google AI Studio Configuration
* **User Control:** Users can freely configure, update, or remove their Gemini API key.
* **Key Input Security:** Masked password input with a clear `Show/Hide` toggle.
* **Live Connection Test:** Includes a `[ Test Connection ]` button that performs a sub-second health ping to Google AI Studio.
  * *Success State:* Green checkmark with `Valid API Key — Gemini Flash ready (<1.5s latency)`.
  * *Error State:* Human-readable guidance (e.g. `Invalid Key: Google returned 403 Forbidden. Check your project permissions`).
* **Engine Mode Selector:**
  * **AI Studio Deep Vision (Cloud):** 100% multimodal accuracy using Gemini Flash.
  * **Hybrid Auto-Fix (Recommended):** Ultra-fast local RapidOCR for crisp cards; auto-escalates to Gemini for low-confidence, blurry, or complex cards.
  * **100% Zero-AI / Local Offline:** Pure local ONNX RapidOCR / Tesseract with zero cloud calls and zero cost.

### 3.2 Google Sheets Webhook Configuration
* **Interactive Setup Guide:** Embedded collapsible accordion with step-by-step instructions:
  1. Open Google Sheet -> Extensions -> Apps Script.
  2. Paste provided 1-click script template.
  3. Deploy as Web App and paste URL into CardVault.
* **Connection Verification:** `[ Test Sheet Connection ]` button sends a diagnostic ping to verify two-way communication before saving.
* **Event Tab Segregation:** Automatically writes contacts into event-specific sheet tabs (e.g. `GITEX_2026`, `CES_Leads`).
* **Pull Controls:** Clean `[ Pull from Google Sheet ]` action with a progress indicator and record counter.

---

## 4. Scanner Station & Review Drawer Flow

### 4.1 Split-View Layout
```
+-------------------------------------------------------+---------------------------------------------+
|  VIEWFINDER / DROPZONE (Left 55%)                     |  SLIDE-OVER REVIEW DRAWER (Right 45%)       |
|                                                       |                                             |
|  +-------------------------------------------------+  |  [Front Photo]  [Back Photo +]              |
|  | [Live Camera Feed / Drop Image Here]            |  |                                             |
|  |                                                 |  |  Full Name      [  Dr. Alex Mercer    ] 🟢  |
|  |    +---------------------------------------+    |  |  Company        [  Apex Global Ltd.   ] 🟢  |
|  |    |  [ Targeting Box / Auto-Card Detect ] |    |  |  Designation    [  Managing Director  ] 🟢  |
|  |    +---------------------------------------+    |  |  Email          [  alex@apex.com      ] 🟢  |
|  |                                                 |  |  Mobile         [  +971 50 123 4567   ] 🟢  |
|  +-------------------------------------------------+  |  Industry       [  Financial Services ] 🟢  |
|                                                       |  Notes / Event  [  GITEX 2026         ]     |
|  [ Shutter Click ]  [ Batch Upload ]  [ Flip Front ]  |                                             |
|                                                       |  [ Button: Approve & Scan Next (Enter) ]   |
+-------------------------------------------------------+---------------------------------------------+
```

### 4.2 Step-by-Step Flow
1. **Targeting & Stability:** Camera stream highlights business card boundaries with a stable green HUD reticle.
2. **Auto or Manual Trigger:** Shutter button captures the card (or user drops an image file).
3. **Extraction & Inline Feedback:** A non-blocking progress pulse displays extraction status (`Extracting via AI Studio...`).
4. **Slide-over Review:** The drawer slides in from the right with high-confidence fields pre-filled and visual confidence dots (🟢 90%+, 🟡 70–89%, 🔴 Missing).
5. **1-Click Approval:** User presses `Enter` or clicks `[ Approve & Scan Next ]`:
   * Contact is saved to local IndexedDB and server `contacts.json`.
   * Google Sheets webhook sync is triggered asynchronously.
   * Subtle audio/haptic confirmation plays.
   * Drawer clears and camera immediately readies for the next card.
6. **Cancellation / Re-scan:** A single `[ Discard ]` button resets the drawer with zero modal interruption.

---

## 5. Elimination of Dead Ends & Confused States

| State / Trigger | Current Confused State | Product-Ready Flow |
| :--- | :--- | :--- |
| **Zero Contacts in Database** | Blank table with no clear direction | Illustrated onboarding card: `[ Launch Camera Scanner ]` or `[ Import Batch / CSV ]`. |
| **Camera Denied or Missing** | Black video box with silent failure | Immediate fallback to clean drag-and-drop file upload zone with sample card presets. |
| **Search / Filter Zero Matches** | Empty screen | Informative card: `No contacts match 'xyz'` with 1-click `[ Clear All Filters ]`. |
| **Offline Network Mode** | Failed fetch error alerts | Yellow offline banner: `Offline Mode Active — Scans are stored safely in local queue`. Automatic background sync when connection restores. |
| **Disconnected Sheets** | Silent failure or broken pull | Clear empty state in Export/Sync tab with direct `[ Connect Google Sheets ]` button opening the guided setup modal. |
| **Modal Duplication** | Modals instantiated in both `App.tsx` and `ScannerStation.tsx` | Single centralized modal store in `App.tsx`; `ScannerStation.tsx` only triggers global modal state. |

---

## 6. Data Integrity & Sync Architecture

### 6.1 Non-Destructive Contact Validation
* **Problem:** `isGarbageContactRecord()` previously treated contacts missing both email and phone as garbage and purged them during disk read operations.
* **Resolution:**
  * Refactor `isGarbageContactRecord()` to only reject true corrupt noise (empty objects or unreadable binary garbage).
  * Incomplete contacts are assigned status `NEEDS_REVIEW` with an amber badge in the database.
  * Reads from disk or IndexedDB **never mutate or delete data**.

### 6.2 Duplicate Merge Sync & Ghost Elimination
* **Problem:** Merging duplicate contacts deleted the duplicate locally, but never notified Google Sheets, causing duplicates to resurrect upon the next pull.
* **Resolution:**
  * Merging duplicates triggers an explicit delete webhook payload to Google Sheets (`action: "delete", id: removeContactId`).
  * Google Sheets Apps Script locates and removes the corresponding row.
  * Subsequent sheet pulls will never re-import the merged contact.

### 6.3 Batched Server Synchronization
* In `storage.ts`, replace the sequential `for...of fetch('/api/contacts')` loop with a single batch request to `/api/contacts/batch-update`, eliminating N+1 network congestion.

---

## 7. Verification & Success Criteria

1. **Modal Architecture:** Zero duplicate modal instances across the codebase; `ScannerStation.tsx` and `App.tsx` share a single modal state.
2. **Scanner Usability:** A user can scan a card, review fields in the slide-over drawer, and approve via `Enter` key within 3 seconds.
3. **Configuration Verification:**
   * Google AI Studio API key can be entered, tested via `[ Test Connection ]`, saved, or removed cleanly.
   * Google Sheets webhook URL can be entered, tested via `[ Test Sheet Connection ]`, and synced both ways.
4. **Data Integrity:**
   * A contact created with only Name and Company is preserved and never deleted on server restart or page refresh.
   * Merging duplicates updates local database and Google Sheets without ghost resurrects.
5. **Zero Dead Ends:** Every empty, blocked, or error state offers a clear 1-click recovery path.
