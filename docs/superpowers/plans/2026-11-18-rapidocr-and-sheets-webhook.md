# RapidOCR Deep-Learning & Google Sheets Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the open-source RapidOCR (PP-OCRv4 ONNX) engine for 98-99% local business card extraction on CPU, and implement real-time background Google Sheets Webhook syncing (Option A) on card save with zero cloud AI API costs.

**Architecture:** A local Python RapidOCR worker (`scripts/ocr_engine.py`) invoked by Express (`server.ts`) processes card images, feeds bounding-box lines into the deterministic semantic entity parser, and auto-dispatches structured contacts to the user's Google Sheets Webhook endpoint.

**Tech Stack:** Python 3.13, `rapidocr_onnxruntime` (PP-OCRv4 ONNX), Node.js / Bun, Express, React, TypeScript, TailwindCSS, Google Apps Script.

**Spec:** [docs/superpowers/specs/2026-11-18-zero-ai-mobile-ocr-sheets-design.md](file:///C:/Users/anvit/Downloads/Card%20Vault/docs/superpowers/specs/2026-11-18-zero-ai-mobile-ocr-sheets-design.md)

## Global Constraints
- Zero cloud AI API costs: All OCR inference runs on local CPU.
- Real-time auto-append (Option A): Every card saved is automatically appended to Google Sheets via Webhook.
- No mandatory OAuth: Use lightweight Google Apps Script Webhook.
- Mobile-first responsiveness: Bottom thumb deck, responsive modal, clean feedback.

---

### Task 1: RapidOCR Python Service Runner

**Files:**
- Create: `scripts/ocr_engine.py`
- Test: `tests/test_rapidocr.py`

- [ ] **Step 1.1**: Create `scripts/ocr_engine.py` accepting `--image <path>` or reading base64 JSON from stdin and outputting structured JSON with lines, boxes, and confidence.
- [ ] **Step 1.2**: Write test script `tests/test_rapidocr.py` verifying execution on `public/assets/aistudio/17949358974903685834212116556903_190d2311.jpg`.
- [ ] **Step 1.3**: Run `python tests/test_rapidocr.py` and confirm all 14 lines are parsed with >80% confidence.

---

### Task 2: Server-Side RapidOCR Integration in `server.ts`

**Files:**
- Modify: `server.ts`
- Modify: `src/utils/ocrParser.ts`

- [ ] **Step 2.1**: In `server.ts`, wire a helper function `runLocalRapidOcr(imageBase64)` that calls `scripts/ocr_engine.py` synchronously or via child process.
- [ ] **Step 2.2**: Update `/api/cards/extract` to run RapidOCR when no Gemini key is provided or when `forceLocalOcr: true`.
- [ ] **Step 2.3**: Map RapidOCR lines and bounding boxes into `parseBusinessCardOcrText()` in `src/utils/ocrParser.ts` so that multi-phone (`Mobile`, `Tel 1`, `Tel 2`), email, address, and company are mapped cleanly.
- [ ] **Step 2.4**: Test `/api/cards/extract` endpoint using curl/Invoke-RestMethod and verify full structured contact extraction.

---

### Task 3: Google Sheets Webhook Service & Sync API

**Files:**
- Create: `src/services/googleSheetsService.ts`
- Modify: `server.ts`
- Modify: `data/config.json`

- [ ] **Step 3.1**: Create `src/services/googleSheetsService.ts` formatting standard 18 CRM columns and sending POST requests to the Webhook URL.
- [ ] **Step 3.2**: Add `/api/sheets/config` (GET/POST) and `/api/sheets/test` in `server.ts` to test Google Sheets connectivity.
- [ ] **Step 3.3**: Add `/api/sheets/sync-contact` endpoint to relay contact payload to the Webhook URL (bypassing CORS restrictions on mobile browsers).

---

### Task 4: Google Sheets Settings UI & Live Trigger

**Files:**
- Create: `src/components/GoogleSheetsModal.tsx`
- Modify: `src/components/ScannerStation.tsx`
- Modify: `src/components/ContactsDatabase.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 4.1**: Build `src/components/GoogleSheetsModal.tsx` with Webhook URL input, "Test Connection" button, Auto-sync toggle, and in-app copyable Google Apps Script code.
- [ ] **Step 4.2**: Add Google Sheets settings button and sync status indicator in the top navbar and `ScannerStation.tsx`.
- [ ] **Step 4.3**: In `ScannerStation.tsx`, trigger background Webhook sync immediately when a card is saved.
- [ ] **Step 4.4**: In `ContactsDatabase.tsx`, add a "Sync All to Google Sheets" button for backfilling contacts.

---

### Task 5: Mobile Ergonomics & End-to-End Verification

**Files:**
- Modify: `src/components/ScannerStation.tsx`

- [ ] **Step 5.1**: Ensure bottom thumb deck layout in `ScannerStation.tsx` works seamlessly on mobile viewports.
- [ ] **Step 5.2**: Run `bun run lint` (`tsc --noEmit`) and `bun run build`.
- [ ] **Step 5.3**: Perform end-to-end verification via headless browser (`browse.exe`).
