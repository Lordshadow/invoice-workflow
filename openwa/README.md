# LedgerFlow Autonomous WhatsApp Ingestion Bridge

This standalone microservice provides automated, real-time invoice ingestion directly from WhatsApp chats.

## Architecture & Capabilities

1. **Headless Chromium Session**: Runs WhatsApp Web via `@open-wa/wa-automate` in the background.
2. **Instant Media Decryption**: Automatically detects incoming PDF documents, camera receipts, and invoice photos (`image/jpeg`, `image/png`, `application/pdf`), decrypting raw binaries on-the-fly.
3. **LedgerFlow Integration**: Forwards the decrypted payload directly to `POST /api/v1/ingest/whatsapp` alongside sender phone, push name, and message tracking metadata.
4. **Contextual Auto-Reply**: Sends automated WhatsApp status updates back to the vendor or employee (e.g., straight-through ERP confirmation, or escalation notice with tracking ID).
5. **Interactive QR Pairing Web View**: Serves a clean, auto-refreshing QR code at `http://localhost:3001/qr` for easy device linking.

---

## Quickstart

### 1. Install Dependencies
```bash
cd openwa
npm install
```

### 2. Configure Environment (Optional)
The service automatically defaults to local LedgerFlow endpoints. You can customize them in `.env`:
```env
PORT=3001
LEDGERFLOW_API_URL=http://127.0.0.1:8000/api/v1/ingest/whatsapp
ENABLE_AUTO_REPLY=true
```

### 3. Start the Bridge
```bash
npm start
```

### 4. Link WhatsApp
1. Open your browser and navigate to `http://localhost:3001/qr`.
2. Open WhatsApp on your phone $\rightarrow$ **Settings / Menu** $\rightarrow$ **Linked Devices** $\rightarrow$ **Link a Device**.
3. Scan the QR code displayed on the screen.
4. Once paired, the status turns to **Connected** and any invoice sent to that WhatsApp number will be autonomously ingested into LedgerFlow.
