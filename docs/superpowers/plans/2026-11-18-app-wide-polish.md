# App-Wide Polish & Screen-by-Screen Perfection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate every screen and component across CardVault to enterprise-grade perfection: clean mobile ergonomics, responsive layouts, unified design tokens, elimination of awkward overflows, and smooth user interactions.

---

### Task 1: Global App Shell & Mobile Navigation (`src/App.tsx`)
- [ ] Refactor mobile bottom navigation bar (`<nav className="md:hidden ...">`) with sleek icon containers, active pill indicators, and count badges (`Contacts [6]`).
- [ ] Add `pb-[max(env(safe-area-inset-bottom),16px)]` safe-area inset support and calibrate `<main className="pb-24 md:pb-8">` so content never collides with fixed bottom elements.
- [ ] Improve top header responsiveness on small screens (<380px) to prevent button wrapping or overflow.
- [ ] Test with `bun x tsc --noEmit`.

---

### Task 2: Dashboard View Polish (`src/components/DashboardView.tsx`)
- [ ] Clean up Hero strip typography and responsive button layout.
- [ ] Refine 4 KPI cards and Event Database cards with 4px grid rhythm and clean borders.
- [ ] Improve "Recently Scanned Cards" list: eliminate text truncation with responsive badges, designation chips, and 1-tap open to `ContactReviewModal`.
- [ ] Test with `bun x tsc --noEmit`.

---

### Task 3: Contacts Database Refinement (`src/components/ContactsDatabase.tsx`)
- [ ] Streamline Action Toolbar: consolidate 7 side-by-side buttons into organized action groups (Primary actions + floating selection action pill for bulk delete/move/export).
- [ ] Mobile Filter Bar: create responsive horizontal filter chips (`All`, `Verified`, `Needs Review`, `Duplicates`) with collapsible advanced filters.
- [ ] Polish card view touch ergonomics with 44px+ tap targets for phone/email/WhatsApp/edit/delete.
- [ ] Test with `bun x tsc --noEmit`.

---

### Task 4: Contact Review Modal Mobile Tabs & In-App Delete (`src/components/ContactReviewModal.tsx`)
- [ ] Add responsive mobile view tabs: `[✏️ Contact Details]` vs `[🖼️ Card Image & OCR Evidence]` so mobile users don't have to scroll past 400px of image to edit fields.
- [ ] Replace native `window.confirm` with in-app Delete Confirmation card.
- [ ] Test with `bun x tsc --noEmit`.

---

### Task 5: Duplicate Merge Modal Responsive Card Layout (`src/components/DuplicateMergeModal.tsx`)
- [ ] Replace rigid 12-column grid (`grid-cols-12`) on small screens with responsive comparison cards (stacked Record A and Record B with 1-tap radio selection).
- [ ] Test with `bun x tsc --noEmit`.

---

### Task 6: Export View & Auxiliary Modals Polish (`ExportView.tsx`, `GoogleSheetsModal.tsx`, `OcrSettingsModal.tsx`)
- [ ] Enhance Export format cards (Excel, CSV, vCard) with file metadata badges and sticky table headers on mobile.
- [ ] Polish Google Sheets modal and OCR settings modal with backdrop blur, smooth dismissal, and copy feedback.
- [ ] Test with `bun x tsc --noEmit`.

---

### Task 7: Full App Verification & Headless Browser Audit
- [ ] Run `bun x tsc --noEmit` (0 errors).
- [ ] Run `bun run build` (clean bundle).
- [ ] Capture headless browser screenshots of all screens on mobile (390×844) and desktop (1280×800) using `browse.exe`.
- [ ] Update `task_tracking.md` artifact.
