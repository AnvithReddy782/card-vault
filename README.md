# CardVault

> Enterprise-Grade Business Card Intelligence & Real-Time CRM Ingestion Suite

CardVault is a production-ready business card scanning and contact intelligence platform. It bridges physical networking events with modern CRM workflows through multimodal vision AI, real-time Google Sheets synchronization, and an Attio/Stripe-inspired executive interface.

---

## Key Capabilities

- **Multimodal Vision Intelligence**: Powered by Google AI Studio (Gemini 2.5 Flash Vision) with automatic entity disambiguation for multi-column layouts, corporate titles, multilingual text, and logos.
- **Local Fallback Extraction**: Embedded RapidOCR engine with spatial line parsing and integrated QR/vCard barcode decoders.
- **Real-Time Google Sheets Sync**: Instant webhook streaming to Google Sheets with dedicated per-event tabs, automatic column matching, and bi-directional pull capabilities.
- **Cross-Device Mobile Bridge**: Instant QR code mobile pairing over local Wi-Fi. Supports both high-resolution native camera photo capture (HTTP) and real-time live viewfinder streaming (HTTPS).
- **Intelligent Deduplication & Merging**: Field-level conflict resolution to merge existing contacts without data loss.
- **Multi-Format Export Center**: One-click generation of multi-tab Excel workbooks (`.xlsx`), standard spreadsheets (`.csv`), and smartphone address books (`.vcf` vCard).
- **Executive Light Design System**: Clean, distraction-free aesthetic with hairline borders, tabular figures, and mobile-optimized touch zones.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────────────┐
                      │              CardVault Frontend               │
                      │   (React 19, TypeScript, Tailwind CSS v4)    │
                      └──────────────┬─────────────────▲──────────────┘
                                     │                 │
                         REST API    │                 │  Vite HMR
                                     ▼                 │
                      ┌───────────────────────────────────────────────┐
                      │           CardVault Express Server            │
                      │     HTTP (Port 3000) & HTTPS (Port 3001)      │
                      └───────┬──────────────┬──────────────┬─────────┘
                              │              │              │
              ┌───────────────┘              │              └────────────────┐
              ▼                              ▼                               ▼
    ┌──────────────────┐           ┌──────────────────┐            ┌───────────────────┐
    │ Google AI Studio │           │ Local RapidOCR   │            │ Google Sheets     │
    │ Gemini 2.5 Flash │           │ Spatial Parsing  │            │ Webhook Sync      │
    └──────────────────┘           └──────────────────┘            └───────────────────┘
```

---

## Quickstart

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm** or **bun**

### 1. Installation

```bash
git clone <repository-url>
cd "Card Vault"
npm install
```

### 2. Environment Configuration

Copy the example configuration:

```bash
cp .env.example .env
```

Set your configuration in `.env` or configure directly within the in-app Settings modal:

```env
# Optional: Pre-configured Gemini API Key (can also be saved via UI)
GEMINI_API_KEY="AIzaSy..."

# Server Ports (defaults: 3000 for HTTP, 3001 for HTTPS)
PORT=3000
HTTPS_PORT=3001
```

### 3. Launch Development Server

```bash
npm run dev
```

The server initializes on:
- **Desktop Dashboard**: `http://localhost:3000`
- **Mobile Access (Wi-Fi)**: `http://<your-lan-ip>:3000` (Native Camera Photo Capture)
- **Mobile Live Stream (HTTPS)**: `https://<your-lan-ip>:3001` (In-App Viewfinder)

---

## In-App Configuration

CardVault provides a centralized configuration panel directly in the web interface:

### 1. Google AI Studio & Vision Engine
- Paste your API key from [Google AI Studio](https://aistudio.google.com/).
- Test connection with one click to verify latency and model availability (`gemini-2.5-flash`).
- Select your extraction strategy: **Hybrid Auto-Escalate**, **AI Studio Preferred**, or **RapidOCR Local**.

### 2. Google Sheets Webhook Sync
- Deploy a Google Apps Script Web App attached to your target Google Sheet.
- Paste the Web App URL (`https://script.google.com/macros/s/.../exec`).
- Toggle **Auto-Sync on Capture** for zero-touch cloud updates.
- Scanned cards automatically route to the corresponding tab named after your active campaign or event.

### 3. Mobile Companion
- Click the **Mobile** button in the header or on the Scanner tab.
- Scan the dynamically generated QR code with your phone camera.
- Capture physical cards directly from your mobile device; contacts appear on your desktop screen in real time.

---

## Production Build & Verification

To verify and produce a production build:

```bash
# Type check and lint
npm run lint

# Production bundle
npm run build

# Start production server
npm start
```

---

## Security & Data Privacy

- **No Hardcoded Keys**: API keys and webhook credentials are saved strictly in `data/config.json` (gitignored).
- **Self-Healing Storage**: Local JSON databases auto-initialize if not present.
- **Sanitized Exports**: PII and contact data are excluded from version control.

---

## License

MIT License. Designed and built for professional enterprise lead workflows.
