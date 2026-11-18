"""
Unit tests for the Unified Blob Storage Abstraction Layer (Sub-Phase 5.2).
"""
import pytest
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch
from backend.app.services.storage import (
    LocalStorageProvider,
    GoogleCloudStorageProvider,
    S3StorageProvider,
    get_storage_provider,
)


def test_local_storage_lifecycle():
    with tempfile.TemporaryDirectory() as tmpdir:
        provider = LocalStorageProvider(base_dir=Path(tmpdir))
        key = "invoices/test_doc.pdf"
        data = b"%PDF-1.4 test invoice content"

        # 1. Upload
        stored_path = provider.upload(key, data, content_type="application/pdf")
        assert Path(stored_path).exists()
        assert provider.exists(key) is True

        # 2. Download
        downloaded = provider.download(key)
        assert downloaded == data

        # 3. Signed URL / Relative endpoint
        url = provider.get_signed_url(key)
        assert "test_doc.pdf" in url

        # 4. Delete
        assert provider.delete(key) is True
        assert provider.exists(key) is False
        assert provider.delete(key) is False

        # 5. Download non-existent raises FileNotFoundError
        with pytest.raises(FileNotFoundError):
            provider.download(key)


def test_gcs_storage_provider_with_mock():
    provider = GoogleCloudStorageProvider(bucket_name="test-bucket", project_id="test-proj")
    mock_bucket = MagicMock()
    mock_blob = MagicMock()
    mock_bucket.blob.return_value = mock_blob
    mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/test-signed-url"
    mock_blob.download_as_bytes.return_value = b"gcs-bytes"
    mock_blob.exists.return_value = True

    provider._bucket = mock_bucket

    # Upload
    res = provider.upload("doc.pdf", b"test-data")
    assert res == "gs://test-bucket/doc.pdf"
    mock_blob.upload_from_string.assert_called_once()

    # Download
    assert provider.download("doc.pdf") == b"gcs-bytes"

    # Signed URL
    assert "https://storage.googleapis.com" in provider.get_signed_url("doc.pdf")

    # Exists & Delete
    assert provider.exists("doc.pdf") is True
    assert provider.delete("doc.pdf") is True


def test_s3_storage_provider_with_mock():
    provider = S3StorageProvider(bucket_name="test-s3-bucket")
    mock_client = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = b"s3-bytes"
    mock_client.get_object.return_value = {"Body": mock_body}
    mock_client.generate_presigned_url.return_value = "https://s3.amazonaws.com/test-url"
    provider._client = mock_client

    # Upload
    res = provider.upload("inv.pdf", b"s3-data")
    assert res == "s3://test-s3-bucket/inv.pdf"

    # Download
    assert provider.download("inv.pdf") == b"s3-bytes"

    # Presigned URL
    assert "https://s3.amazonaws.com" in provider.get_signed_url("inv.pdf")

    # Exists & Delete
    assert provider.exists("inv.pdf") is True
    assert provider.delete("inv.pdf") is True


def test_storage_provider_factory():
    provider = get_storage_provider()
    assert provider is not None
    assert hasattr(provider, "upload")
    assert hasattr(provider, "download")
