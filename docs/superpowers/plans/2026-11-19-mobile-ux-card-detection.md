# Mobile UX, Edit Modal & Intelligent Card Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Contact Review / Edit Modal into a native, high-end mobile bottom sheet with thumb-friendly controls, and engineer high-accuracy business card auto-detection and graceful "card not available" handling in Scanner Station.

**Architecture:**
- **UI Layer (`ContactReviewModal.tsx`)**: Refactor into a true native mobile bottom sheet with an ergonomic top handle, compact pinned header (back button, title, status pill, event dropdown), unified 3-option segmented tab switcher (`[✏️ Details]`, `[🖼️ Photo & OCR]`, `[⚡ Diagnostics]`), mobile-optimized form cards (44px touch-target inputs with text-[16px] to prevent iOS zoom), and a pinned bottom safe-area action bar for 1-tap saving.
- **Vision Engine (`imageProcessor.ts`)**: Overhaul `analyzeVideoFrameStability` with robust multi-cue card presence detection (aspect ratio, text stroke density, contrast gradients, boundary contours), supporting 1-line to multi-line typography, dark/light cards, and damped jitter-tolerant stability scoring.
- **Scanner Station (`ScannerStation.tsx`)**: Wire the improved card detector to the HUD (clear "No Card In View" vs "Card Detected" vs "Locking" states), prevent auto-triggering on blank scenes, and add intelligent "Card Not Available" interception on manual capture with user-friendly actionable feedback and "Capture Anyway" fallback.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Canvas API, Playwright/gstack `browse`.

## Global Constraints
- Maximum viewport target: 390x844 (mobile standard). Zero horizontal overflow (`overflow-x: hidden`).
- Safe-area support for modern mobile devices (`pb-[max(env(safe-area-inset-bottom),14px)]`).
- Input font size minimum 16px on mobile to avoid iOS Safari viewport auto-zoom.
- All visual outcomes must be validated with gstack `browse` and screenshot evidence.

## Review Focus
1. `ContactReviewModal` layout on 390px viewport: Header must not exceed 64px, single clean tab bar, inputs fully reachable and scrollable.
2. Form fields saving: Changes made in any field must reliably persist to state and database via `onSaveAndContinue`.
3. Auto-scan on clean card: Auto-lock ring fills smoothly and triggers capture without getting stuck.
4. Auto-scan on empty scene / hand / wall: `cardDetected` remains `false`, auto-snap never triggers.
5. Manual shutter on empty scene: Displays clear "No business card detected" guidance banner without sending blank frames to OCR.

---

### Task 1: Overhaul Card Detection Engine in `src/utils/imageProcessor.ts`

**Files:**
- Modify: `src/utils/imageProcessor.ts`

**Interfaces:**
- `analyzeVideoFrameStability(video, analysisCanvas, prevPixels, lastCapturedSignature)`
  - Returns: `{ stabilityScore, cardDetected, textLineSignal, focusSharpness, cardConfidence, statusReason, ... }`

- [ ] **Step 1: Inspect and enhance `analyzeVideoFrameStability` logic**
  - Calculate contrast span, edge gradients, and stroke pairs with relaxed minimum line requirements (allow cards with 1 or 2 lines of strong typography).
  - Add card confidence metric (0-100) based on weighted signals: edge presence (30%), stroke density (35%), aspect ratio/paper smoothness (20%), contrast span (15%).
  - Smooth stability calculation so single frame noise doesn't crash progress from 80% to 0%.

- [ ] **Step 2: Add quick card validation helper `isFrameAcceptableForCardExtraction`**
  - Provide a fast sanity check method to verify whether a captured image contains a plausible business card or is blank/empty/blurry.

- [ ] **Step 3: Build verification test**
  - Run `bun test` or `bun run build` to ensure zero compilation or type errors.

---

### Task 2: Implement "Card Not Available" Guidance & Adaptive Auto-Scan in `ScannerStation.tsx`

**Files:**
- Modify: `src/components/ScannerStation.tsx`

**Interfaces:**
- Consumes: Enhanced `analyzeVideoFrameStability` and `isFrameAcceptableForCardExtraction` from Task 1.

- [ ] **Step 1: Refactor auto-scan trigger condition**
  - Replace rigid `metrics.textLineSignal >= 3` and instant reset with a damped 4-tick stability accumulator (`stabilityStreakRef.current`).
  - Auto-snap only triggers when `metrics.cardDetected` is true and confidence is solid.

- [ ] **Step 2: Add "Card Not Available" HUD feedback**
  - When camera is active but no card is detected:
    - Display "Looking for card... Center in viewfinder" with subtle neutral brackets.
  - When card is detected:
    - Display "Business Card Detected — Hold Steady" with glowing cyan/emerald brackets.
  - When locking:
    - Display "Auto-Scanning (XX%)" with active circular progress ring.

- [ ] **Step 3: Handle manual shutter when no card is detected**
  - In `captureCurrentVideoFrame`, if `isManualTrigger` is clicked while `!cardDetected`:
    - Perform fast frame check. If blank or no card features are detected, show a prominent inline notice: "No business card detected — please align card and hold steady" with a "Force Scan Anyway" button.

- [ ] **Step 4: Verify with `browse` on mobile viewport (390x844)**
  - Screenshot HUD in "Looking for card" state.

---

### Task 3: Redesign `ContactReviewModal.tsx` as a High-End Mobile Bottom Sheet

**Files:**
- Modify: `src/components/ContactReviewModal.tsx`

**Interfaces:**
- Consumes: `ContactRecord`, `onSaveAndContinue`, `onDeleteContact`, `onClose`.

- [ ] **Step 1: Clean, compact mobile sheet container**
  - Top rounded pull-down handle bar (`w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-2.5`).
  - Compact header (max 56px height): Back/Close icon button, Title ("Edit Contact"), Contact ID & Status Badge, and Event Dropdown. Remove stacked buttons from header.

- [ ] **Step 2: Clean single segmented control tab bar**
  - Three distinct tabs: `[ ✏️ Contact Details ]`, `[ 📸 Card Evidence ]`, `[ ⚡ Scan Audit ]`.

- [ ] **Step 3: Redesign form fields into ergonomic mobile cards**
  - Group into collapsible or cleanly spaced cards:
    - 👤 **Identity**: Full Name, First Name, Last Name with 1-tap "Swap Name ⇄ Company" pill.
    - 🏢 **Organization & Role**: Company Name, Job Title, Department.
    - 📞 **Communication**: Phone 1, Phone 2, Email Address, Website URL.
    - 📍 **Address**: Street Address, City, State, Postal Code, Country.
    - 📝 **Notes & Custom Fields**.
  - All input fields: minimum 44px touch height, 16px font size, clean labels, high-contrast borders.

- [ ] **Step 4: Pinned sticky bottom action bar**
  - Pinned safe-area footer (`shrink-0 bg-white border-t border-slate-200 p-3 pb-[max(env(safe-area-inset-bottom),14px)]`).
  - Full-width or ergonomic split action buttons:
    - Primary: **"Save & Verify Contact"** (emerald/blue high-contrast button).
    - Secondary: Quick swap pill or overflow menu.
    - Delete button in confirmation popup.

- [ ] **Step 5: Verify modal scrolling, tab switching, and field editing on 390x844**
  - Use `browse` to open modal, inspect layout, type into fields, switch tabs, and verify sticky save bar.

---

### Task 4: End-to-End Mobile Flow Verification & Visual Sign-Off

**Files:**
- Verification across: `ScannerStation`, `ContactsDatabase`, `ContactReviewModal`.

- [ ] **Step 1: Run full production build (`bun run build`)**
  - Confirm 0 TypeScript or Tailwind errors.

- [ ] **Step 2: Visual verification with `browse` CLI**
  - Capture screenshots of:
    1. Scanner Station HUD (Card search state).
    2. Contact Review Modal on mobile (Fields tab showing clean grouped cards and pinned bottom bar).
    3. Contact Review Modal on mobile (Photo & OCR tab).
  - Inspect all screenshots with `read_file`.

- [ ] **Step 3: Document completion and verify zero regressions**
