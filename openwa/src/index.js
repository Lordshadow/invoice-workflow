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

// -----------------------------------------------------------------------------
// Interactive Ingestion Sessions & Safety Guardrail (5-Minute Inactivity Timer)
// -----------------------------------------------------------------------------
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of no use -> auto off
const activeSessions = new Map(); // senderId -> { timeoutHandle, startedAt, lastActivityAt }

/**
 * Resets the 5-minute inactivity timer for an active session.
 */
function refreshSessionTimeout(client, senderId) {
  const session = activeSessions.get(senderId);
  if (!session) return;

  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle);
  }

  session.lastActivityAt = Date.now();
  session.timeoutHandle = setTimeout(async () => {
    activeSessions.delete(senderId);
    console.log(`[WhatsApp Guardrail] Session for ${senderId} expired due to 5 minutes of inactivity.`);
    try {
      await client.sendText(
        senderId,
        '⏳ *Invoice Session Expired*\n\nYour 5-minute invoice intake session has automatically closed due to inactivity.\n\nSend */invoice* anytime to activate a new intake session.'
      );
    } catch (e) {
      console.error(`[WhatsApp Guardrail] Failed to notify ${senderId} of timeout:`, e.message);
    }
  }, INACTIVITY_TIMEOUT_MS);
}

/**
 * Activates an invoice intake session for a sender.
 */
async function activateSession(client, senderId, pushName = 'Vendor') {
  if (activeSessions.has(senderId)) {
    refreshSessionTimeout(client, senderId);
    await client.sendText(
      senderId,
      'ℹ️ *Invoice Intake Mode is already active!*\n\nPlease send your invoice document (PDF or Photo).\n\n🛑 When finished, send */stop* to close intake mode.'
    );
    return;
  }

  activeSessions.set(senderId, {
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    timeoutHandle: null,
  });

  refreshSessionTimeout(client, senderId);
  console.log(`[WhatsApp Guardrail] Activated 5-minute intake session for ${senderId}`);

  await client.sendText(
    senderId,
    `📥 *Invoice Intake Mode Activated!*\n\n` +
    `Hello ${pushName}, please send or upload your invoice document (PDF or Photo).\n\n` +
    `⏱️ *Safety Guardrail:* This session will automatically turn off after 5 minutes of no use.\n` +
    `🛑 *Done uploading?* Send */stop* at any time to stop the bot from taking invoices.`
  );
}

/**
 * Deactivates an active session manually.
 */
async function deactivateSession(client, senderId) {
  const session = activeSessions.get(senderId);
  if (session) {
    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle);
    }
    activeSessions.delete(senderId);
    console.log(`[WhatsApp Guardrail] Manually closed session for ${senderId}`);
    await client.sendText(
      senderId,
      '🛑 *Invoice Intake Deactivated*\n\n' +
      'The bot has stopped receiving invoices from this number.\n\n' +
      'To submit invoices again in the future, simply send */invoice*.'
    );
  } else {
    await client.sendText(
      senderId,
      'ℹ️ No active invoice session. Send */invoice* to activate intake mode.'
    );
  }
}

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

// 3. Message Routing, Command Processing & Media Ingestion
async function handleIncomingMessage(client, message) {
  try {
    const senderId = message.from;
    const senderName = message.sender?.pushname || message.sender?.formattedName || 'WhatsApp Contact';
    const textBody = (message.body || '').trim().toLowerCase();

    // -------------------------------------------------------------------------
    // A. Interactive Text Commands (/invoice, /stop, /help)
    // -------------------------------------------------------------------------
    if (textBody === '/invoice' || textBody === 'invoice') {
      await activateSession(client, senderId, senderName);
      return;
    }

    if (textBody === '/stop' || textBody === 'stop') {
      await deactivateSession(client, senderId);
      return;
    }

    if (textBody === '/help' || textBody === 'help' || textBody === 'hi' || textBody === 'hello') {
      if (activeSessions.has(senderId)) {
        refreshSessionTimeout(client, senderId);
        await client.sendText(
          senderId,
          '📥 *Invoice Intake is Currently ACTIVE*\n\n' +
          '• Send a PDF or photo of your invoice to submit.\n' +
          '• Send */stop* when finished to close intake mode.\n' +
          '• Session will auto-close after 5 minutes of inactivity.'
        );
      } else {
        await client.sendText(
          senderId,
          '👋 *Welcome to LedgerFlow Accounts Payable Assistant*\n\n' +
          'To submit an invoice for automated processing:\n' +
          '1️⃣ Send */invoice* to activate intake mode.\n' +
          '2️⃣ Upload your invoice PDF or photo.\n' +
          '3️⃣ Send */stop* when finished to stop the bot.\n\n' +
          '⏱️ *Safety Guardrail:* Intake sessions turn off automatically after 5 minutes of no use.'
        );
      }
      return;
    }

    // -------------------------------------------------------------------------
    // B. Inbound Media Attachments (Invoices / Receipts / PDFs)
    // -------------------------------------------------------------------------
    const isMedia = message.mimetype && SUPPORTED_MIME_TYPES.has(message.mimetype.toLowerCase());

    if (isMedia) {
      // Guardrail Check: Is intake mode active for this number?
      if (!activeSessions.has(senderId)) {
        console.log(`[WhatsApp Intake] Ignored media from ${senderId} (Intake mode is OFF)`);
        await client.sendText(
          senderId,
          '🔒 *Invoice Intake is Currently OFF*\n\n' +
          'To submit an invoice, please activate the intake service first by sending:\n' +
          '👉 */invoice*\n\n' +
          '_(Sessions automatically close after 5 minutes of inactivity)_'
        );
        return;
      }

      // Reset the 5-minute inactivity timer
      refreshSessionTimeout(client, senderId);

      console.log(`[WhatsApp Intake] Inbound document from ${senderId} (${message.mimetype})`);

      // Decrypt media payload
      let mediaData;
      try {
        mediaData = await client.decryptMedia(message);
      } catch (decryptErr) {
        console.error(`[WhatsApp Intake] Decryption error for ${senderId}:`, decryptErr);
      }

      if (!mediaData || mediaData.length === 0) {
        console.warn(`[WhatsApp Intake] Media decryption returned empty buffer for message ${message.id}`);
        await client.sendText(
          senderId,
          '⚠️ *Resend your invoice*\n\n' +
          'Could not decrypt or read the file attachment. Please try sending your invoice again.'
        );
        return;
      }

      const filename = message.filename || `whatsapp_${senderId.replace('@c.us', '')}_${Date.now()}.${message.mimetype.split('/')[1] || 'pdf'}`;
      const senderPhone = senderId.replace('@c.us', '');

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

      console.log(`[WhatsApp Intake] Forwarding '${filename}' to LedgerFlow Cloud Run engine...`);

      let response;
      try {
        response = await fetch(LEDGERFLOW_API_URL, {
          method: 'POST',
          body: form,
          headers: form.getHeaders(),
          timeout: 45000, // 45s timeout for OCR + Gemini extraction
        });
      } catch (networkErr) {
        console.error(`[WhatsApp Intake] Network/timeout error connecting to LedgerFlow API:`, networkErr);
      }

      // Handle Failures & Errors
      if (!response || !response.ok) {
        const errText = response ? await response.text() : 'Connection timeout';
        console.error(`[WhatsApp Intake] Ingestion failed (Status: ${response?.status}): ${errText}`);
        
        await client.sendText(
          senderId,
          '⚠️ *Resend your invoice*\n\n' +
          'We encountered a problem while processing and storing your document in the cloud.\n' +
          'Please verify that the image or PDF is clear and resend your invoice.'
        );
        return;
      }

      // Handle Success
      const result = await response.json();
      console.log(`[WhatsApp Intake] Successfully ingested & stored! Doc ID: ${result.document_id}, Invoice ID: ${result.invoice_id}`);

      const grossValue = Number(result.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      const trackingId = result.invoice_id || result.document_id || 'REGISTERED';

      await client.sendText(
        senderId,
        `✅ *Invoice received*\n\n` +
        `📄 *File:* ${result.file_name || filename}\n` +
        `💰 *Gross Value:* ₹${grossValue}\n` +
        `🆔 *Tracking ID:* ${trackingId}\n` +
        `☁️ *Storage:* Stored in Google Cloud Storage & Database\n\n` +
        `👉 Send another invoice, or send */stop* to stop the bot from taking invoices.`
      );
      return;
    }

    // -------------------------------------------------------------------------
    // C. Non-Command Text Messages
    // -------------------------------------------------------------------------
    if (activeSessions.has(senderId)) {
      refreshSessionTimeout(client, senderId);
      await client.sendText(
        senderId,
        '📥 *Invoice Intake Mode is Active*\n\n' +
        'Please send a PDF or photo of your invoice.\n' +
        'Or send */stop* to stop the bot from taking invoices.'
      );
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
