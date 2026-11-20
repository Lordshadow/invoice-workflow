# LedgerFlow Autonomous WhatsApp Ingestion Bridge

This standalone microservice provides automated, real-time invoice ingestion directly from WhatsApp chats.

## Architecture & Capabilities

1. **Headless Chromium Session**: Runs WhatsApp Web via `@open-wa/wa-automate` in the background.
2. **Instant Media Decryption**: Automatically detects incoming PDF documents, camera receipts, and invoice photos (`image/jpeg`, `image/png`, `application/pdf`), decrypting raw binaries on-the-fly.
3. **LedgerFlow Integration**: Forwards the decrypted payload directly to `POST /api/v1/ingest/whatsapp` alongside sender phone, push name, and message tracking metadata.
4. **Contextual Auto-Reply**: Sends automated WhatsApp status updates back to the vendor or employee (e.g., straight-through ERP confirmation, or escalation notice with tracking ID).
5. **Interactive QR Pairing Web View**: Serves a clean, auto-refreshing QR code at `http://localhost:3001/qr` for easy device linking.

## Interactive WhatsApp Bot Commands & Guardrails

1. **/invoice**: Activates an intake session for the sender's phone number. Inbound PDFs and photos are only accepted during an active session.
2. **Safety Auto-Timeout (5 Minutes)**: If no invoice or message is received within 5 minutes of activation, the intake session closes automatically.
3. **Success Indication**: After every invoice is uploaded and saved to Google Cloud Storage / Cloud SQL, the bot replies:
   `"✅ Invoice received"` along with gross value, tracking ID, and cloud storage confirmation.
4. **Error Handling**: If the document encounters any issue or decryption error, the bot replies:
   `"⚠️ Resend your invoice"`.
5. **/stop**: After submitting invoices, the user can send `/stop` at any time to immediately close the intake session.

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
