"""
Automated Email Ingestion Service (IMAP Background Poller).
Periodically checks the configured AP email inbox, extracts invoice attachments,
and ingests them autonomously into the LedgerFlow pipeline.
"""
import asyncio
import email
from email.header import decode_header
import imaplib
import logging
from pathlib import Path
from typing import List, Optional, Tuple

from backend.app.config import settings
from backend.app.db.session import SessionLocal, TargetSessionLocal
from backend.app.services.ingestion_service import IngestionService

logger = logging.getLogger("invoice_processor.services.email_poller")

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx"}


def decode_str(header_value: Optional[str]) -> str:
    """Safely decodes an RFC 2047 email header string."""
    if not header_value:
        return ""
    decoded_fragments = decode_header(header_value)
    result = []
    for fragment, encoding in decoded_fragments:
        if isinstance(fragment, bytes):
            try:
                result.append(fragment.decode(encoding or "utf-8", errors="replace"))
            except Exception:
                result.append(fragment.decode("latin-1", errors="replace"))
        else:
            result.append(str(fragment))
    return "".join(result)


class EmailPollerService:
    """
    Asynchronous IMAP client that scans incoming emails for invoice documents.
    """

    def __init__(self):
        self._is_running = False
        self._task: Optional[asyncio.Task] = None

    def _connect(self) -> imaplib.IMAP4:
        """Establishes an authenticated connection to the IMAP server."""
        if not settings.IMAP_HOST or not settings.IMAP_USER or not settings.IMAP_PASSWORD:
            raise ValueError("IMAP credentials (host, user, password) are not configured.")

        if settings.IMAP_USE_SSL:
            client = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
        else:
            client = imaplib.IMAP4(settings.IMAP_HOST, settings.IMAP_PORT)

        client.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        return client

    def poll_once(self) -> int:
        """
        Executes a single polling cycle over the target mailbox.
        Returns the count of successfully processed invoice attachments.
        """
        if not settings.ENABLE_EMAIL_POLLER:
            logger.debug("Email poller is disabled in configuration.")
            return 0

        processed_count = 0
        client = None

        try:
            logger.debug(f"Connecting to IMAP server {settings.IMAP_HOST}:{settings.IMAP_PORT}...")
            client = self._connect()
            client.select(settings.IMAP_FOLDER)

            # Search for unread emails
            status, response = client.search(None, "UNSEEN")
            if status != "OK":
                logger.warning(f"Failed to query mailbox '{settings.IMAP_FOLDER}': {response}")
                return 0

            email_ids = response[0].split()
            if not email_ids:
                logger.debug(f"No unseen emails in '{settings.IMAP_FOLDER}'.")
                return 0

            logger.info(f"Found {len(email_ids)} unseen email(s) in inbox. Processing attachments...")

            for email_id in email_ids:
                try:
                    fetch_status, fetch_data = client.fetch(email_id, "(RFC822)")
                    if fetch_status != "OK" or not fetch_data or not fetch_data[0]:
                        continue

                    raw_email_bytes = fetch_data[0][1]
                    if not isinstance(raw_email_bytes, bytes):
                        continue

                    msg = email.message_from_bytes(raw_email_bytes)
                    sender = decode_str(msg.get("From", "unknown@sender.local"))
                    subject = decode_str(msg.get("Subject", "No Subject"))
                    message_id_header = msg.get("Message-ID", str(email_id.decode("ascii", errors="ignore")))

                    logger.debug(f"Parsing email: Subject='{subject}', From='{sender}'")

                    # Walk through multipart components to find invoice attachments
                    for part in msg.walk():
                        if part.get_content_maintype() == "multipart":
                            continue

                        raw_filename = part.get_filename()
                        if not raw_filename:
                            continue

                        filename = decode_str(raw_filename).strip()
                        file_ext = Path(filename).suffix.lower()

                        if file_ext in SUPPORTED_EXTENSIONS:
                            file_bytes = part.get_payload(decode=True)
                            if not file_bytes:
                                continue

                            logger.info(
                                f"Ingesting invoice attachment '{filename}' ({len(file_bytes)} bytes) from '{sender}'"
                            )

                            with SessionLocal() as db, TargetSessionLocal() as target_db:
                                res = IngestionService.ingest_invoice(
                                    file_bytes=file_bytes,
                                    filename=filename,
                                    source="email",
                                    db=db,
                                    target_db=target_db,
                                    source_metadata={
                                        "from_email": sender,
                                        "subject": subject,
                                        "message_id": message_id_header,
                                    },
                                )
                                logger.info(
                                    f"Successfully ingested email invoice {filename} -> Doc ID: {res.document_id}, Invoice ID: {res.invoice_id}, Status: {res.status}"
                                )
                                processed_count += 1

                    # Mark email as read / Seen
                    client.store(email_id, "+FLAGS", "\\Seen")

                except Exception as msg_err:
                    logger.error(f"Error processing email {email_id}: {msg_err}", exc_info=True)

        except Exception as conn_err:
            logger.error(f"IMAP polling cycle encountered error: {conn_err}")
        finally:
            if client:
                try:
                    client.close()
                    client.logout()
                except Exception:
                    pass

        return processed_count

    async def _poller_loop(self):
        """Infinite background loop running with sleep interval."""
        logger.info(
            f"Email Poller background worker started. Polling every {settings.IMAP_POLL_INTERVAL_SECONDS}s."
        )
        while self._is_running:
            try:
                # Run the blocking IMAP operations in an executor pool
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self.poll_once)
            except Exception as loop_err:
                logger.error(f"Exception inside email poller loop: {loop_err}", exc_info=True)

            await asyncio.sleep(max(5, settings.IMAP_POLL_INTERVAL_SECONDS))

    def start(self):
        """Starts the asynchronous background polling task."""
        if not settings.ENABLE_EMAIL_POLLER:
            logger.info("Automated email polling is disabled (ENABLE_EMAIL_POLLER=false).")
            return

        if self._is_running:
            logger.warning("Email poller is already running.")
            return

        self._is_running = True
        self._task = asyncio.create_task(self._poller_loop())
        logger.info("Email poller background task scheduled.")

    def stop(self):
        """Gracefully halts the background poller."""
        self._is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Email poller background task cancelled.")


email_poller_service = EmailPollerService()
