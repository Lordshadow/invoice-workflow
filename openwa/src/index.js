/**
 * Autonomous WhatsApp Media & Invoice Ingestion Bridge for LedgerFlow.
 * 
 * Features:
 * - Scans incoming WhatsApp chats for PDF and image invoices.
 * - Automatically decrypts media binaries.
 * - Forwards media + sender metadata to POST /api/v1/ingest/whatsapp.
 * - Sends instantaneous formatted auto-reply to the sender on WhatsApp.
 * - Exposes /qr web view for seamless pairing with Android/iOS WhatsApp scanner.
 */

import express from 'express';
import wa from '@open-wa/wa-automate';
import FormData from 'form-data';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 3001;
const LEDGERFLOW_API_URL = process.env.LEDGERFLOW_API_URL || 'http://127.0.0.1:8000/api/v1/ingest/whatsapp';
const ENABLE_AUTO_REPLY = process.env.ENABLE_AUTO_REPLY !== 'false';

const app = express();
let latestQrDataUrl = null;
let clientStatus = 'INITIALIZING';
let activeClient = null;

// Supported mime types for automatic AP ingestion
const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

// 1. QR Code Pairing Page
app.get('/qr', (req, res) => {
  if (clientStatus === 'CONNECTED') {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LedgerFlow WhatsApp Bridge</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; text-align: center; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
          .badge { background: #10b981; color: white; padding: 0.5rem 1rem; border-radius: 9999px; font-weight: bold; font-size: 0.875rem; display: inline-block; margin-bottom: 1rem; }
          h2 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { color: #94a3b8; font-size: 0.875rem; margin: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● Live Connected</div>
          <h2>WhatsApp Bridge Active</h2>
          <p>Listening for inbound vendor invoices and receipts...</p>
        </div>
      </body>
      </html>
    `);
  }

  if (!latestQrDataUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LedgerFlow WhatsApp Bridge</title>
        <meta http-equiv="refresh" content="3">
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; text-align: center; border: 1px solid #334155; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Initializing WhatsApp Client...</h2>
          <p>Generating pairing QR code. Page refreshes automatically...</p>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pair WhatsApp — LedgerFlow Intake Bridge</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b1120; color: #f8fafc; }
        .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; text-align: center; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); max-width: 420px; width: 90%; }
        .qr-wrapper { background: white; padding: 1rem; border-radius: 1rem; display: inline-block; margin: 1.5rem 0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
        .qr-wrapper img { width: 260px; height: 260px; display: block; }
        h1 { font-size: 1.25rem; font-weight: 800; margin: 0 0 0.5rem 0; letter-spacing: -0.025em; }
        ol { text-align: left; font-size: 0.8125rem; color: #94a3b8; line-height: 1.6; padding-left: 1.25rem; margin: 1.5rem 0 0 0; }
        li { margin-bottom: 0.35rem; }
      </style>
      <script>
        // Poll status every 4 seconds to reload once connected
        setInterval(async () => {
          try {
            const res = await fetch('/status');
            const data = await res.json();
            if (data.status === 'CONNECTED') {
              window.location.reload();
            }
          } catch(e) {}
        }, 4000);
      </script>
    </head>
    <body>
      <div class="card">
        <h1>Link Accounts Payable WhatsApp</h1>
        <div class="qr-wrapper">
          <img src="${latestQrDataUrl}" alt="WhatsApp QR Code" />
        </div>
        <ol>
          <li>Open WhatsApp on your mobile phone</li>
          <li>Tap <b>Menu (⋮)</b> or <b>Settings</b> &rarr; <b>Linked Devices</b></li>
          <li>Tap <b>Link a Device</b> and point camera at this screen</li>
        </ol>
      </div>
    </body>
    </html>
  `);
});

// 2. Health & Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: clientStatus,
    api_endpoint: LEDGERFLOW_API_URL,
    auto_reply_enabled: ENABLE_AUTO_REPLY,
  });
});

// 3. Media Ingestion & Forwarding Logic
async function handleIncomingMessage(client, message) {
  try {
    // Only process messages with media attachments
    if (!message.mimetype || !SUPPORTED_MIME_TYPES.has(message.mimetype.toLowerCase())) {
      return;
    }

    console.log(`[WhatsApp Intake] Inbound document from ${message.from} (${message.mimetype})`);

    // Decrypt media payload
    const mediaData = await client.decryptMedia(message);
    if (!mediaData || mediaData.length === 0) {
      console.warn(`[WhatsApp Intake] Media decryption returned empty buffer for message ${message.id}`);
      return;
    }

    const filename = message.filename || `whatsapp_${message.from}_${Date.now()}.${message.mimetype.split('/')[1] || 'pdf'}`;
    const senderName = message.sender?.pushname || message.sender?.formattedName || 'WhatsApp Contact';
    const senderPhone = message.from.replace('@c.us', '');

    // Construct multipart form for LedgerFlow API
    const form = new FormData();
    form.append('file', mediaData, {
      filename,
      contentType: message.mimetype,
    });
    form.append('sender_phone', senderPhone);
    form.append('sender_name', senderName);
    form.append('message_id', message.id);
    form.append('timestamp', String(message.t || Date.now()));

    console.log(`[WhatsApp Intake] Forwarding '${filename}' to LedgerFlow ingestion engine...`);

    const response = await fetch(LEDGERFLOW_API_URL, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp Intake] LedgerFlow ingestion failed (HTTP ${response.status}): ${errText}`);
      return;
    }

    const result = await response.json();
    console.log(`[WhatsApp Intake] Ingestion successful! Doc ID: ${result.document_id}, Invoice ID: ${result.invoice_id}, Status: ${result.status}`);

    // Send instant WhatsApp reply if configured
    if (ENABLE_AUTO_REPLY && result.auto_reply_text) {
      await client.sendText(message.from, result.auto_reply_text);
      console.log(`[WhatsApp Intake] Auto-reply delivered to ${message.from}`);
    }
  } catch (err) {
    console.error(`[WhatsApp Intake] Exception processing inbound message:`, err);
  }
}

// 4. Start OpenWA Client and Express Server
async function start() {
  app.listen(PORT, () => {
    console.log(`[WhatsApp Bridge] HTTP Server listening on port ${PORT}`);
    console.log(`[WhatsApp Bridge] Pair QR web view: http://localhost:${PORT}/qr`);
  });

  try {
    const client = await wa.create({
      sessionId: 'LEDGERFLOW_SESSION',
      multiDevice: true,
      authTimeout: 60,
      blockCrashLogs: true,
      disableSpins: true,
      headless: true,
      hostNotificationLang: 'PT_BR',
      logConsole: false,
      popup: false,
      qrTimeout: 0,
      cacheEnabled: false,
      useChrome: true,
      chromiumArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      qrCallback: (qrDataUrl) => {
        latestQrDataUrl = qrDataUrl;
        clientStatus = 'QR_REQUIRED';
        console.log(`[WhatsApp Bridge] New QR code generated. View at: http://localhost:${PORT}/qr`);
      },
    });

    activeClient = client;
    clientStatus = 'CONNECTED';
    latestQrDataUrl = null;
    console.log('[WhatsApp Bridge] WhatsApp Web Client Successfully Connected!');

    client.onMessage(async (message) => {
      await handleIncomingMessage(client, message);
    });

    client.onStateChanged((state) => {
      console.log(`[WhatsApp Bridge] Connection state changed: ${state}`);
      if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
        clientStatus = 'DISCONNECTED';
      }
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] Initialization error:', err);
    clientStatus = 'ERROR';
  }
}

// Run if directly executed
start();
