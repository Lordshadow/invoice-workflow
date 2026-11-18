"""
Unified Blob Storage Abstraction Layer ("Host Anywhere").
Fulfills Sub-Phase 5.2 (Task 5.2.1):
- Abstract StorageProvider interface
- LocalStorageProvider for zero-config local filesystem and test environments
- GoogleCloudStorageProvider for GCP Cloud Run / GCS production
- S3StorageProvider for AWS / MinIO object storage
"""
import logging
from abc import ABC, abstractmethod
from datetime import timedelta
from pathlib import Path
from typing import Optional

from backend.app.config import settings

logger = logging.getLogger("invoice_processor.storage")


class StorageProvider(ABC):
    """Abstract interface for object/blob storage across multi-cloud and local deployments."""

    @abstractmethod
    def upload(self, file_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Uploads binary payload to storage and returns URI or relative path."""
        pass

    @abstractmethod
    def download(self, file_path: str) -> bytes:
        """Retrieves binary payload for given storage path."""
        pass

    @abstractmethod
    def get_signed_url(self, file_path: str, ttl_seconds: int = 3600) -> str:
        """Generates a secure, time-limited download URL."""
        pass

    @abstractmethod
    def delete(self, file_path: str) -> bool:
        """Deletes object from storage if it exists."""
        pass

    @abstractmethod
    def exists(self, file_path: str) -> bool:
        """Checks if file exists in storage."""
        pass


class LocalStorageProvider(StorageProvider):
    """Local filesystem storage adapter for standalone single-VM, CI, and local dev."""

    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = Path(base_dir) if base_dir else settings.UPLOAD_DIR
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, file_path: str) -> Path:
        p = Path(file_path)
        if p.is_absolute():
            return p
        return self.base_dir / file_path

    def upload(self, file_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        target = self._resolve(file_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        logger.debug(f"LocalStorageProvider: Wrote {len(data)} bytes to {target}")
        return str(target)

    def download(self, file_path: str) -> bytes:
        target = self._resolve(file_path)
        if not target.is_file():
            raise FileNotFoundError(f"File not found in local storage: {target}")
        return target.read_bytes()

    def get_signed_url(self, file_path: str, ttl_seconds: int = 3600) -> str:
        # Local storage returns file endpoint path
        clean_name = Path(file_path).name
        return f"{settings.API_V1_PREFIX}/invoices/file/{clean_name}"

    def delete(self, file_path: str) -> bool:
        target = self._resolve(file_path)
        if target.is_file():
            target.unlink()
            return True
        return False

    def exists(self, file_path: str) -> bool:
        return self._resolve(file_path).is_file()


class GoogleCloudStorageProvider(StorageProvider):
    """Google Cloud Storage adapter using official google-cloud-storage SDK."""

    def __init__(self, bucket_name: Optional[str] = None, project_id: Optional[str] = None):
        self.bucket_name = bucket_name or getattr(settings, "GCS_BUCKET_NAME", "invoice-processing-bucket")
        self.project_id = project_id or settings.GCP_PROJECT_ID
        self._client = None
        self._bucket = None

    def _get_bucket(self):
        if self._bucket is None:
            try:
                from google.cloud import storage
                self._client = storage.Client(project=self.project_id)
                self._bucket = self._client.bucket(self.bucket_name)
            except Exception as e:
                logger.warning(f"GoogleCloudStorageProvider initialization notice: {e}")
        return self._bucket

    def upload(self, file_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        bucket = self._get_bucket()
        if bucket:
            blob = bucket.blob(file_path)
            blob.upload_from_string(data, content_type=content_type)
            return f"gs://{self.bucket_name}/{file_path}"
        # Fallback to local storage if cloud credentials unavailable in test
        return LocalStorageProvider().upload(file_path, data, content_type)

    def download(self, file_path: str) -> bytes:
        bucket = self._get_bucket()
        if bucket:
            blob = bucket.blob(file_path)
            return blob.download_as_bytes()
        return LocalStorageProvider().download(file_path)

    def get_signed_url(self, file_path: str, ttl_seconds: int = 3600) -> str:
        bucket = self._get_bucket()
        if bucket:
            blob = bucket.blob(file_path)
            return blob.generate_signed_url(expiration=timedelta(seconds=ttl_seconds), method="GET")
        return LocalStorageProvider().get_signed_url(file_path, ttl_seconds)

    def delete(self, file_path: str) -> bool:
        bucket = self._get_bucket()
        if bucket:
            blob = bucket.blob(file_path)
            if blob.exists():
                blob.delete()
                return True
            return False
        return LocalStorageProvider().delete(file_path)

    def exists(self, file_path: str) -> bool:
        bucket = self._get_bucket()
        if bucket:
            blob = bucket.blob(file_path)
            return blob.exists()
        return LocalStorageProvider().exists(file_path)


class S3StorageProvider(StorageProvider):
    """AWS S3 and MinIO storage adapter using boto3."""

    def __init__(self, bucket_name: Optional[str] = None):
        self.bucket_name = bucket_name or getattr(settings, "S3_BUCKET_NAME", "invoices")
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import boto3
                self._client = boto3.client("s3")
            except Exception as e:
                logger.warning(f"S3StorageProvider initialization notice: {e}")
        return self._client

    def upload(self, file_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        client = self._get_client()
        if client:
            client.put_object(Bucket=self.bucket_name, Key=file_path, Body=data, ContentType=content_type)
            return f"s3://{self.bucket_name}/{file_path}"
        return LocalStorageProvider().upload(file_path, data, content_type)

    def download(self, file_path: str) -> bytes:
        client = self._get_client()
        if client:
            resp = client.get_object(Bucket=self.bucket_name, Key=file_path)
            return resp["Body"].read()
        return LocalStorageProvider().download(file_path)

    def get_signed_url(self, file_path: str, ttl_seconds: int = 3600) -> str:
        client = self._get_client()
        if client:
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": file_path},
                ExpiresIn=ttl_seconds
            )
        return LocalStorageProvider().get_signed_url(file_path, ttl_seconds)

    def delete(self, file_path: str) -> bool:
        client = self._get_client()
        if client:
            client.delete_object(Bucket=self.bucket_name, Key=file_path)
            return True
        return LocalStorageProvider().delete(file_path)

    def exists(self, file_path: str) -> bool:
        client = self._get_client()
        if client:
            try:
                client.head_object(Bucket=self.bucket_name, Key=file_path)
                return True
            except Exception:
                return False
        return LocalStorageProvider().exists(file_path)


# Default Singleton Storage Instance
_storage_instance: Optional[StorageProvider] = None


def get_storage_provider() -> StorageProvider:
    """Factory returning configured storage provider singleton based on runtime environment."""
    global _storage_instance
    if _storage_instance is None:
        provider_name = getattr(settings, "STORAGE_PROVIDER", "local").lower()
        if provider_name == "gcs" or settings.USE_VERTEX_AI:
            _storage_instance = GoogleCloudStorageProvider()
        elif provider_name in ("s3", "minio"):
            _storage_instance = S3StorageProvider()
        else:
            _storage_instance = LocalStorageProvider()
    return _storage_instance
