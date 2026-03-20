"""Azure Blob Storage backend for DocumentStore / JobStore / ResultCache.

All operations use DefaultAzureCredential (Managed Identity / Entra ID)
so no storage account key is needed.

Environment variables:
  AZURE_STORAGE_ACCOUNT_NAME   – Storage account name
  AZURE_STORAGE_CONTAINER_NAME – Blob container name (default: appstorage)

Usage:
  Set STORAGE_BACKEND=blob in .env to use Azure Blob Storage as the backend
  instead of local files (SMB).
"""

import base64
import hashlib
import json
import logging
import mimetypes
import re
import threading
import time
import uuid
from typing import Any

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContainerClient, ContentSettings

from src.storage import StoredDocument

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────

def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _build_blob_service_client(account_name: str) -> BlobServiceClient:
    credential = DefaultAzureCredential()
    account_url = f"https://{account_name}.blob.core.windows.net"
    return BlobServiceClient(account_url=account_url, credential=credential)


# ════════════════════════════════════════════════════════════════
# BlobDocumentStore
# ════════════════════════════════════════════════════════════════

class BlobDocumentStore:
    """Store uploaded documents in Azure Blob Storage.

    Blob naming:
        uploads/{document_id}__{safe_filename}
        uploads/index.json
    """

    _PREFIX = "uploads/"

    def __init__(self, *, account_name: str, container_name: str):
        self._container: ContainerClient = (
            _build_blob_service_client(account_name)
            .get_container_client(container_name)
        )
        self._ensure_container()
        self._docs: dict[str, StoredDocument] = {}
        self._lock = threading.Lock()
        self._load_index()

    def _ensure_container(self) -> None:
        try:
            self._container.get_container_properties()
        except Exception:
            self._container.create_container()

    # ── Public API (same as local DocumentStore) ───────────────

    def refresh_from_disk(self) -> int:
        """Rescan blob prefix to pick up blobs added outside this process."""
        return self._scan_blobs()

    def save_upload(self, file: FileStorage) -> StoredDocument:
        original_filename = file.filename or "uploaded"
        safe_name = secure_filename(original_filename)
        document_id = str(uuid.uuid4())

        data = file.read()
        file_hash = _sha256_bytes(data)
        guessed_type, _ = mimetypes.guess_type(safe_name)
        content_type = file.mimetype or guessed_type or "application/octet-stream"

        blob_name = f"{self._PREFIX}{document_id}__{safe_name}"
        self._container.get_blob_client(blob_name).upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
        )

        doc = StoredDocument(
            document_id=document_id,
            original_filename=original_filename,
            content_type=content_type,
            size_bytes=len(data),
            file_hash=file_hash,
            path=None,
        )
        with self._lock:
            self._docs[document_id] = doc
            self._save_index()
        return doc

    def get(self, document_id: str) -> StoredDocument | None:
        with self._lock:
            return self._docs.get(document_id)

    def get_content(self, document_id: str) -> bytes | None:
        """Download blob content for the given document."""
        doc = self.get(document_id)
        if doc is None:
            return None
        blob_name = self._blob_name_for(doc)
        try:
            return self._container.get_blob_client(blob_name).download_blob().readall()
        except Exception:
            logger.warning("Failed to download blob: %s", blob_name, exc_info=True)
            return None

    def list_documents(self) -> list[StoredDocument]:
        with self._lock:
            return list(self._docs.values())

    def find_by_hash(self, file_hash: str) -> list[StoredDocument]:
        if not file_hash:
            return []
        with self._lock:
            return [d for d in self._docs.values() if d.file_hash == file_hash]

    def delete(self, document_id: str) -> bool:
        with self._lock:
            doc = self._docs.pop(document_id, None)
            if doc is None:
                return False
            blob_name = self._blob_name_for(doc)
            try:
                self._container.get_blob_client(blob_name).delete_blob()
            except Exception:
                pass
            self._save_index()
        return True

    # ── Internal helpers ───────────────────────────────────────

    def _blob_name_for(self, doc: StoredDocument) -> str:
        safe_name = secure_filename(doc.original_filename)
        return f"{self._PREFIX}{doc.document_id}__{safe_name}"

    def _load_index(self) -> None:
        index_blob = f"{self._PREFIX}index.json"
        try:
            data = self._container.get_blob_client(index_blob).download_blob().readall()
            raw = json.loads(data)
        except Exception:
            # Index doesn't exist yet or can't be read — fallback to scan.
            self._scan_blobs()
            return

        if not isinstance(raw, dict):
            return

        loaded: dict[str, StoredDocument] = {}
        for doc_id, v in raw.items():
            if not isinstance(v, dict):
                continue
            try:
                doc = StoredDocument(
                    document_id=str(doc_id),
                    original_filename=str(v.get("original_filename", "")),
                    content_type=str(v.get("content_type", "application/octet-stream")),
                    size_bytes=int(v.get("size_bytes", 0)),
                    file_hash=str(v.get("file_hash", "")),
                    path=None,
                )
            except Exception:
                continue
            loaded[doc.document_id] = doc

        with self._lock:
            self._docs.update(loaded)

    def _scan_blobs(self) -> int:
        added = 0
        pat = re.compile(r"^(?P<id>[0-9a-fA-F-]{16,})__(?P<name>.+)$")
        try:
            blobs = list(self._container.list_blobs(name_starts_with=self._PREFIX))
        except Exception:
            logger.warning("Failed to list blobs under %s", self._PREFIX, exc_info=True)
            return 0

        for blob in blobs:
            name = blob.name.removeprefix(self._PREFIX)
            if name == "index.json":
                continue
            m = pat.match(name)
            if not m:
                continue
            doc_id = m.group("id")
            original_filename = m.group("name")
            with self._lock:
                if doc_id in self._docs:
                    continue

            guessed_type, _ = mimetypes.guess_type(original_filename)
            content_type = guessed_type or "application/octet-stream"
            size = blob.size or 0
            doc = StoredDocument(
                document_id=doc_id,
                original_filename=original_filename,
                content_type=content_type,
                size_bytes=size,
                file_hash="",  # Hash not computed during scan (no download needed)
                path=None,
            )
            with self._lock:
                if doc_id in self._docs:
                    continue
                self._docs[doc_id] = doc
                added += 1

        if added:
            with self._lock:
                self._save_index()
        return added

    def _save_index(self) -> None:
        data: dict[str, dict[str, Any]] = {}
        for doc_id, d in self._docs.items():
            data[doc_id] = {
                "original_filename": d.original_filename,
                "content_type": d.content_type,
                "size_bytes": d.size_bytes,
                "file_hash": d.file_hash,
            }
        index_blob = f"{self._PREFIX}index.json"
        self._container.get_blob_client(index_blob).upload_blob(
            json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
            overwrite=True,
        )


# ════════════════════════════════════════════════════════════════
# BlobJobStore
# ════════════════════════════════════════════════════════════════

class BlobJobStore:
    """Store analysis job metadata in memory + result JSON in Blob Storage.

    Blob naming:  results/{job_id}.json
    """

    _PREFIX = "results/"

    def __init__(self, *, account_name: str, container_name: str):
        self._container: ContainerClient = (
            _build_blob_service_client(account_name)
            .get_container_client(container_name)
        )
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(self, *, job_id: str, document_id: str, model_id: str) -> None:
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "documentId": document_id,
                "modelId": model_id,
                "status": "queued",
                "error": None,
                "createdAt": _now_ms(),
                "updatedAt": _now_ms(),
            }

    def set_running(self, job_id: str) -> None:
        with self._lock:
            self._jobs[job_id]["status"] = "running"
            self._jobs[job_id]["updatedAt"] = _now_ms()

    def set_failed(self, *, job_id: str, error: str) -> None:
        with self._lock:
            self._jobs[job_id]["status"] = "failed"
            self._jobs[job_id]["error"] = error
            self._jobs[job_id]["updatedAt"] = _now_ms()

    def set_succeeded(self, *, job_id: str, result: dict[str, Any]) -> None:
        blob_name = f"{self._PREFIX}{job_id}.json"
        self._container.get_blob_client(blob_name).upload_blob(
            json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
            overwrite=True,
        )
        with self._lock:
            self._jobs[job_id]["status"] = "succeeded"
            self._jobs[job_id]["updatedAt"] = _now_ms()

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def load_result(self, job_id: str) -> dict[str, Any] | None:
        """Load result JSON from Blob Storage."""
        blob_name = f"{self._PREFIX}{job_id}.json"
        try:
            data = self._container.get_blob_client(blob_name).download_blob().readall()
            return json.loads(data)
        except Exception:
            return None


# ════════════════════════════════════════════════════════════════
# BlobResultCache
# ════════════════════════════════════════════════════════════════

class BlobResultCache:
    """Cache analysis results in Azure Blob Storage.

    Blob naming:  cache/{file_hash}/{encoded_model_id}.json
    """

    _PREFIX = "cache/"

    def __init__(self, *, account_name: str, container_name: str):
        self._container: ContainerClient = (
            _build_blob_service_client(account_name)
            .get_container_client(container_name)
        )

    def has(self, *, file_hash: str, model_id: str) -> bool:
        blob_name = self._blob_path(file_hash=file_hash, model_id=model_id)
        return self._container.get_blob_client(blob_name).exists()

    def load(self, *, file_hash: str, model_id: str) -> dict[str, Any]:
        blob_name = self._blob_path(file_hash=file_hash, model_id=model_id)
        data = self._container.get_blob_client(blob_name).download_blob().readall()
        return json.loads(data)

    def save(self, *, file_hash: str, model_id: str, result: dict[str, Any],
             options: dict[str, Any] | None = None) -> str:
        from datetime import datetime, timezone
        blob_name = self._blob_path(file_hash=file_hash, model_id=model_id)
        result["_meta"] = {
            "savedAt": datetime.now(timezone.utc).isoformat(),
            "options": {k: v for k, v in (options or {}).items()
                        if v not in (None, [], "", {})},
        }
        self._container.get_blob_client(blob_name).upload_blob(
            json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
            overwrite=True,
        )
        return blob_name

    def list_file_hashes(self) -> list[str]:
        hashes: set[str] = set()
        for blob in self._container.list_blobs(name_starts_with=self._PREFIX):
            parts = blob.name.removeprefix(self._PREFIX).split("/")
            if len(parts) >= 2:
                hashes.add(parts[0])
        return sorted(hashes)

    def delete_file_hash(self, *, file_hash: str) -> int:
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        prefix = f"{self._PREFIX}{safe_hash}/"
        count = 0
        for blob in self._container.list_blobs(name_starts_with=prefix):
            try:
                self._container.get_blob_client(blob.name).delete_blob()
                count += 1
            except Exception:
                pass
        return count

    def list_model_ids(self, *, file_hash: str) -> list[str]:
        return [v["label"] for v in self.list_variants(file_hash=file_hash)]

    def list_variants(self, *, file_hash: str) -> list[dict[str, Any]]:
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        prefix = f"{self._PREFIX}{safe_hash}/"
        out: list[dict[str, Any]] = []
        for blob in self._container.list_blobs(name_starts_with=prefix):
            name = blob.name.removeprefix(prefix)
            if not name.endswith(".json"):
                continue
            encoded_key = name[:-5]
            mid = _decode_model_id(encoded_key)
            if not mid:
                continue
            if mid.startswith("cu:"):
                core = re.sub(r"^cu:(?:v\d+:)?", "", mid)
                svc = "CU"
            else:
                core = mid
                svc = "DI"
            if "__" in core:
                base = core.split("__")[0]
                label = f"[{svc}] {base} (+options)"
            else:
                label = f"[{svc}] {core}"

            # Read _meta from blob content
            saved_at = ""
            option_keys: list[str] = []
            try:
                blob_client = self._container.get_blob_client(blob.name)
                data = json.loads(blob_client.download_blob().readall())
                meta = data.get("_meta")
                if meta and isinstance(meta, dict):
                    saved_at = meta.get("savedAt", "")
                    opts = meta.get("options")
                    if opts and isinstance(opts, dict):
                        option_keys = sorted(opts.keys())
            except Exception:  # noqa: BLE001
                pass

            # Fallback: blob last_modified
            if not saved_at and hasattr(blob, 'last_modified') and blob.last_modified:
                saved_at = blob.last_modified.isoformat()

            out.append({
                "label": label,
                "key": encoded_key,
                "savedAt": saved_at,
                "optionKeys": option_keys,
            })
        out.sort(key=lambda v: v["label"])
        return out

    def load_by_key(self, *, file_hash: str, encoded_key: str) -> dict[str, Any] | None:
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        if not re.fullmatch(r"[A-Za-z0-9_-]+", encoded_key):
            return None
        blob_name = f"{self._PREFIX}{safe_hash}/{encoded_key}.json"
        try:
            data = self._container.get_blob_client(blob_name).download_blob().readall()
            return json.loads(data)
        except Exception:
            return None

    def cache_count(self, *, file_hash: str) -> int:
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        prefix = f"{self._PREFIX}{safe_hash}/"
        return sum(
            1 for blob in self._container.list_blobs(name_starts_with=prefix)
            if blob.name.endswith(".json")
        )

    def _blob_path(self, *, file_hash: str, model_id: str) -> str:
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        safe_model = _encode_model_id(model_id)
        return f"{self._PREFIX}{safe_hash}/{safe_model}.json"


# ── Base64 model ID encoding (same logic as cache.py) ─────────

def _encode_model_id(model_id: str) -> str:
    raw = (model_id or "model").encode("utf-8")
    b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return b64[:120]


def _decode_model_id(encoded: str) -> str | None:
    if not encoded:
        return None
    try:
        pad = "=" * ((4 - (len(encoded) % 4)) % 4)
        raw = base64.urlsafe_b64decode((encoded + pad).encode("ascii"))
        return raw.decode("utf-8")
    except Exception:
        return None
