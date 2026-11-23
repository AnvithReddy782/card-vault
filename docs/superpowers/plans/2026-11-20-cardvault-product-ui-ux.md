# CardVault Product UI/UX & Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform CardVault into an intuitive, commercial-grade B2B lead capture product featuring a Linear-style enterprise aesthetic, split-view scanner with an instant slide-over review drawer, centralized modal orchestration, transparent user configuration for AI keys and Google Sheets, and non-destructive data integrity.

**Architecture:** We establish a centralized React Modal Context in `src/context/ModalContext.tsx` to eliminate duplicate modal DOM trees and state drift between `App.tsx` and `ScannerStation.tsx`. We extract `ScannerReviewDrawer.tsx` for immediate inline card verification with 1-click `Enter` approval, refactor `ScannerStation.tsx` to a clean split-view, update `OcrSettingsModal` and `GoogleSheetsModal` with live connection test pings and masked inputs, and fix data layer edge cases in `cardValidator.ts` and `storage.ts` so partial contacts are preserved rather than silently deleted.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide React icons, Motion (Framer Motion), Vite, Node/Express, IndexedDB, Google GenAI SDK.

**Spec:** `docs/superpowers/specs/2026-11-20-cardvault-product-ui-ux-design.md`

## Global Constraints

* Do not introduce any new external runtime dependencies; use existing libraries (`lucide-react`, `motion`, `react`, `express`).
* All user configuration (Google AI Studio API key and Google Sheets Webhook URL) must remain completely user-configurable with secure masking and live test connectivity checks.
* Preserving data is paramount: partial contact records (e.g. Name + Company without email or phone) must receive status `NEEDS_REVIEW` and must **never** be silently deleted from disk or IndexedDB.
* Zero dead ends: Every screen, empty state, camera block, or search miss must provide a direct 1-click interactive recovery action.

## Review Focus

1. **Partial Contacts Discard on Read:** A user creates or scans a contact with only `fullName` and `companyName`. Calling `getAllLocalContacts()` or reading from server disk must NOT delete the record; it must return the record with `status: 'NEEDS_REVIEW'`.
2. **Duplicate Sheets Resurrections:** When two contacts are merged, the removed duplicate ID must be dispatched for deletion to Google Sheets so that pulling from Sheets does not resurrect the merged duplicate.
3. **Modal State Desynchronization:** Opening OCR settings or Google Sheets configuration from either the top navigation bar or the scanner station must update the exact same centralized state without prop dropouts (e.g. `onPullFromSheets` must work everywhere).
4. **Camera Denied Fallback:** Denying webcam permissions must not result in a broken black rectangle; it must immediately render a clean drag-and-drop file upload zone with sample presets.
5. **Keyboard Rapid Capture:** In the scanner review drawer, pressing the `Enter` key must trigger `"Approve & Scan Next"` and immediately return focus to the camera for consecutive scanning.

---

### Task 1: Non-Destructive Contact Validation & Batch Sync (Data Layer)

**Files:**
* Modify: `src/utils/cardValidator.ts:448-475`
* Modify: `src/utils/storage.ts:30-55, 188-245`
* Test: `tests/cardValidator.test.ts`

**Interfaces:**
* Consumes: `ContactRecord`, `ContactFields` from `src/types/card.ts`
* Produces: `isGarbageContactRecord(record: ContactRecord): boolean`, `repairContactRecordFields(record: ContactRecord): ContactRecord`, `syncContactsWithServer(): Promise<ContactRecord[]>`

- [ ] **Step 1: Write the failing test for non-destructive validation**

Create `tests/cardValidator.test.ts`:
```typescript
import assert from 'node:assert';
import { isGarbageContactRecord, repairContactRecordFields } from '../src/utils/cardValidator.ts';
import { ContactRecord } from '../src/types/card.ts';

function createMockContact(partialFields: any): ContactRecord {
  return {
    id: 'test-contact-123',
    scanHash: 'hash-123',
    status: 'NEEDS_REVIEW',
    fields: {
      fullName: { value: 'Jane Doe', confidence: 95, source: 'OCR' },
      companyName: { value: 'Acme Corp', confidence: 90, source: 'OCR' },
      ...partialFields,
    },
    customFields: [],
    tags: ['GITEX 2026'],
    notes: '',
    syncStatus: 'LOCAL_ONLY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Test 1: Partial contact with only name & company is NOT garbage
const partialContact = createMockContact({
  email: { value: '', confidence: 0, source: 'MANUAL' },
  mobileNumber: { value: '', confidence: 0, source: 'MANUAL' },
});
assert.strictEqual(
  isGarbageContactRecord(partialContact),
  false,
  'Partial contact with name and company should not be marked as garbage'
);

// Test 2: Incomplete contact gets status NEEDS_REVIEW when repaired
const repaired = repairContactRecordFields(partialContact);
assert.strictEqual(repaired.id, 'test-contact-123');
assert.strictEqual(repaired.fields.fullName.value, 'Jane Doe');

// Test 3: Total garbage noise is marked as garbage
const noiseContact = createMockContact({
  fullName: { value: '!!!###$$$', confidence: 10, source: 'OCR' },
  companyName: { value: '%%%^^^', confidence: 10, source: 'OCR' },
  email: { value: '', confidence: 0, source: 'MANUAL' },
  mobileNumber: { value: '', confidence: 0, source: 'MANUAL' },
});
assert.strictEqual(
  isGarbageContactRecord(noiseContact),
  true,
  'Unreadable gibberish noise should be marked as garbage'
);

console.log('cardValidator tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/cardValidator.test.ts`
Expected: FAIL because `isGarbageContactRecord()` currently requires an email or phone anchor and marks `partialContact` as garbage (`true`).

- [ ] **Step 3: Refactor `isGarbageContactRecord` and `storage.ts`**

In `src/utils/cardValidator.ts`:
1. Update `isGarbageContactRecord()`:
   * Only return `true` if `record` or `record.fields` is missing, or if `fullName` and `companyName` and `email` and `mobileNumber` are ALL empty or match `KNOWN_CORRUPTED_NOISE_REGEX`.
   * If a record has a readable `fullName` or `companyName` (length >= 2, not noise), return `false`.
2. In `src/utils/storage.ts`:
   * In `getAllLocalContacts()`, do not delete contacts that have valid names or companies; ensure repaired records keep their `status`.
   * In `syncContactsWithServer()`, replace the individual `for (const lc of localContacts)` sequential `fetch('/api/contacts')` loop with a single batch call to `fetch('/api/contacts/batch-update', { method: 'POST', body: JSON.stringify({ contacts: toSync }) })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/cardValidator.test.ts`
Expected: Output `cardValidator tests passed!`

---

### Task 2: Centralized Modal Store & Provider (`ModalContext.tsx`)

**Files:**
* Create: `src/context/ModalContext.tsx`
* Modify: `src/App.tsx:1-80, 1280-1360`

**Interfaces:**
* Produces:
  ```typescript
  export interface ModalContextType {
    openOcrSettings: () => void;
    closeOcrSettings: () => void;
    isOcrSettingsOpen: boolean;

    openSheetsModal: () => void;
    closeSheetsModal: () => void;
    isSheetsModalOpen: boolean;

    openMobileModal: () => void;
    closeMobileModal: () => void;
    isMobileModalOpen: boolean;

    openBulkUpload: () => void;
    closeBulkUpload: () => void;
    isBulkUploadOpen: boolean;

    openDuplicateMerge: (primary: ContactRecord, duplicate: ContactRecord) => void;
    closeDuplicateMerge: () => void;
    mergingPair: { primary: ContactRecord; duplicate: ContactRecord } | null;

    openContactReview: (contact: ContactRecord) => void;
    closeContactReview: () => void;
    reviewingContact: ContactRecord | null;
  }
  export const useModal: () => ModalContextType;
  export const ModalProvider: React.FC<{ children: React.ReactNode }>;
  ```

- [ ] **Step 1: Create `src/context/ModalContext.tsx`**

Implement `ModalContext` and `ModalProvider` with clean state hooks and typed helper dispatchers.

- [ ] **Step 2: Mount `ModalProvider` in `src/App.tsx`**

1. Wrap the top-level application with `<ModalProvider>`.
2. Move all modal JSX rendering (`<OcrSettingsModal>`, `<GoogleSheetsModal>`, `<MobileConnectModal>`, `<BulkUploadModal>`, `<DuplicateMergeModal>`, `<ContactReviewModal>`) inside a single container consumed from `useModal()`.
3. Verify that `GoogleSheetsModal` receives both `onConfigSaved` and `onPullFromSheets={handlePullFromGoogleSheets}`.

- [ ] **Step 3: Verify TypeScript builds without type errors**

Run: `npx tsc --noEmit`
Expected: Clean pass with no modal state type errors.

---

### Task 3: Professional Integrations UI (Google Sheets & AI Key Modals)

**Files:**
* Modify: `src/components/OcrSettingsModal.tsx`
* Modify: `src/components/GoogleSheetsModal.tsx`
* Modify: `src/services/googleSheetsService.ts`

**Interfaces:**
* Consumes: `useModal()` from `src/context/ModalContext.tsx`
* Produces: Live connection test states, masked inputs, and deletion propagation to Google Sheets webhook.

- [ ] **Step 1: Upgrade `OcrSettingsModal.tsx`**

1. Add a masked input with a password eye toggle (`Show / Hide`) for the Google AI Studio API key.
2. Add a `[ Test Connection ]` button:
   * When clicked, calls `/api/test-key` (or Google AI Studio `/models/gemini-2.5-flash`).
   * Displays an immediate status indicator:
     * 🟢 `Connection Verified: Gemini Flash is active & responsive.`
     * 🔴 `Connection Failed: [Error details]`.
3. Provide a clear 3-way radio selection for OCR Engine:
   * `Google AI Studio Deep Vision (100% Precision)`
   * `Hybrid Smart Auto-Fix (RapidOCR + Gemini on low confidence)`
   * `100% Local RapidOCR (Zero API Key, Zero Cloud Cost)`
4. Add clear visual confirmation badges.

- [ ] **Step 2: Upgrade `GoogleSheetsModal.tsx` & `googleSheetsService.ts`**

1. Add an interactive 3-step setup guide accordion explaining how to paste the Apps Script template.
2. Add a `[ Test Sheet Connection ]` button calling `/api/sheets/test` with instant visual status feedback.
3. In `src/services/googleSheetsService.ts`, add:
   ```typescript
   export async function deleteContactFromGoogleSheets(contactId: string): Promise<boolean>;
   ```
4. Wire `handleConfirmDuplicateMerge` in `App.tsx` to invoke `deleteContactFromGoogleSheets(removeContactId)` so deleted duplicate rows are purged from Google Sheets.

- [ ] **Step 3: Verify modal changes with TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 4: Global Header & Live Status Hub (`HeaderStatusHub.tsx`)

**Files:**
* Create: `src/components/HeaderStatusHub.tsx`
* Modify: `src/App.tsx`

**Interfaces:**
* Consumes: `useModal()` for modal triggers, system status props (`hasGeminiKey`, `isSheetsConnected`, `hasMobileDevice`, `activeEvent`, `availableEvents`, `onSelectEvent`, `onCreateEvent`, `onQuickScan`).
* Produces:
  ```typescript
  export interface HeaderStatusHubProps {
    hasGeminiKey: boolean;
    ocrEnginePreference: string;
    isSheetsConnected: boolean;
    hasMobileDevice: boolean;
    activeEvent: string;
    availableEvents: string[];
    onSelectEvent: (event: string) => void;
    onCreateEvent: (event: string) => void;
    onQuickScan: () => void;
  }
  ```

- [ ] **Step 1: Create `src/components/HeaderStatusHub.tsx`**

1. Design the Linear-style dark slate header:
   * CardVault Pro logo with subtle violet icon badge.
   * Active Event Pill: Displays active event tag (e.g. `GITEX 2026`) with a dropdown to switch or create an event in 1 click.
   * Status Pill Cluster:
     * AI Studio Pill: 🟢 `AI Studio Active` / 🟡 `Local RapidOCR` (click triggers `openOcrSettings()`).
     * Google Sheets Pill: 🟢 `Sheets Synced` / ⚪ `Sheets Unconfigured` (click triggers `openSheetsModal()`).
     * Mobile Link Pill: 🟢 `Mobile Ready` (click triggers `openMobileModal()`).
   * Persistent Primary Action: High-contrast `[ + Scan New Card ]` button that switches to the `scanner` tab.
2. Style with crisp `border-white/10`, tabular numbers, and smooth hover micro-interactions.

- [ ] **Step 2: Integrate `HeaderStatusHub` in `src/App.tsx`**

Replace the existing fragmented header in `src/App.tsx` with `<HeaderStatusHub />`.

- [ ] **Step 3: Verify TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 5: Slide-Over Review Drawer (`ScannerReviewDrawer.tsx`)

**Files:**
* Create: `src/components/ScannerReviewDrawer.tsx`
* Consumes: Extracted contact draft, front/back image thumbnails, `onApprove(contact: ContactRecord)`, `onDiscard()`.

**Interfaces:**
* Produces:
  ```typescript
  export interface ScannerReviewDrawerProps {
    isOpen: boolean;
    cardFrontUrl: string;
    cardBackUrl?: string;
    extractedFields: ContactFields;
    confidence: number;
    engineUsed: string;
    activeEvent: string;
    onApprove: (updatedFields: ContactFields) => void;
    onDiscard: () => void;
  }
  ```

- [ ] **Step 1: Create `src/components/ScannerReviewDrawer.tsx`**

1. Implement slide-over container using Tailwind CSS and smooth transitions (`transform translate-x-0`).
2. Header with Card Thumbnail (side-by-side front + back toggle) and OCR engine badge (`Google AI Studio` or `RapidOCR`).
3. Field review grid:
   * Inputs for `Full Name`, `Company Name`, `Designation`, `Mobile Number`, `Email`, `Website`, `Address`, `Industry`.
   * Confidence status indicator beside each input:
     * 🟢 90%+ confidence
     * 🟡 70–89% confidence
     * 🔴 Missing or low confidence (<70%)
4. Action buttons:
   * Primary: **`[ Approve & Scan Next (Enter) ]`**
   * Secondary: **`[ Discard / Retake ]`**
5. Add global `keydown` listener so pressing `Enter` when not in a multiline textarea immediately triggers `onApprove`.

- [ ] **Step 2: Verify component types with TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 6: Streamlined Scanner Station (`ScannerStation.tsx`)

**Files:**
* Modify: `src/components/ScannerStation.tsx`

- [ ] **Step 1: Remove all duplicate modal code from `ScannerStation.tsx`**

1. Remove internal states: `showOcrSettings`, `showSheetsModal`, `showMobileConnectModal`, `showBulkUploadModal`.
2. Remove internal JSX renderings of `<OcrSettingsModal>`, `<GoogleSheetsModal>`, `<MobileConnectModal>`, `<BulkUploadModal>`.
3. Use `const { openOcrSettings, openSheetsModal, openMobileModal, openBulkUpload } = useModal();` from `ModalContext` for any trigger buttons.

- [ ] **Step 2: Integrate `ScannerReviewDrawer` into `ScannerStation.tsx`**

1. Organize the scanner layout as a responsive split-view:
   * Left side (55%): Camera viewport with clean targeting HUD, live stability badge (`Card Detected · 98%`), and bottom control bar (`[ Shutter ]`, `[ Upload File ]`, `[ Batch Upload ]`).
   * Right side (45%): Embedded `ScannerReviewDrawer` that animates in when a card scan completes.
2. Wire `onApprove`: saves contact, fires background sync, plays subtle audio beep, and resets camera viewfinder for the next scan immediately.
3. Fallback state: If webcam is blocked or unavailable, automatically show a clean drag-and-drop zone with sample business cards for instant testing with zero dead ends.

- [ ] **Step 3: Verify TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 7: Zero-Dead-End Actionable Empty States Across All Views

**Files:**
* Modify: `src/components/ContactsDatabase.tsx`
* Modify: `src/components/DashboardView.tsx`
* Modify: `src/components/ExportView.tsx`

- [ ] **Step 1: Update `ContactsDatabase.tsx` empty states**

1. When contact list is empty: Show an illustrated onboarding card:
   * Title: "Your Contact Vault is Empty"
   * Description: "Scan business cards with your live camera, upload card photos, or import a batch."
   * CTAs: `[ Launch Scanner ]` and `[ Import Batch / CSV ]`.
2. When search or filters return 0 matches:
   * Title: "No contacts match your filter"
   * Action: `[ Clear all filters ]` button that immediately resets query and event filters.

- [ ] **Step 2: Update `DashboardView.tsx` empty states**

1. When total contacts = 0: Render quick-start action cards ("Quick Scan", "Import Batch", "Pair Mobile Device") instead of empty zero-value graphs.

- [ ] **Step 3: Update `ExportView.tsx` empty states**

1. When Google Sheets is not configured: Show a clean integration banner: "Sync directly to Google Sheets in real-time" with a direct button `[ Connect Google Sheets ]` that calls `openSheetsModal()`.

- [ ] **Step 4: Verify TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 8: End-to-End Build & Smoke Verification

**Files:**
* Verify: Entire project workspace

- [ ] **Step 1: Run TypeScript compiler validation**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run Unit / Validation tests**

Run: `npx tsx tests/cardValidator.test.ts`
Expected: All validation checks pass.

- [ ] **Step 3: Build production bundle**

Run: `npm run build`
Expected: Vite build completes cleanly into `dist/`.

- [ ] **Step 4: Smoke test all critical user flows**
1. Launch dev server: `npm run dev`
2. Verify Header Status Hub renders with live status pills.
3. Open AI key modal -> verify masked input and `[ Test Connection ]` button.
4. Open Google Sheets modal -> verify setup guide and `[ Test Sheet Connection ]` button.
5. In Scanner Station, drop a sample card -> verify slide-over review drawer slides in with confidence badges -> press `Enter` to approve -> verify contact appears in Contacts Database with zero dead ends.
