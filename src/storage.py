import json
import mimetypes
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import hashlib
import re

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename


@dataclass(frozen=True)
class StoredDocument:
    document_id: str
    original_filename: str
    content_type: str
    size_bytes: int
    file_hash: str
    path: Path | None = None


class DocumentStore:
    def __init__(self, *, upload_dir: Path):
        self._upload_dir = upload_dir
        self._docs: dict[str, StoredDocument] = {}
        self._lock = threading.Lock()

        self._index_path = self._upload_dir / "index.json"
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._load_index()
        # Scan in case the index is missing/corrupt/incomplete
        self._scan_upload_dir()

    def refresh_from_disk(self) -> int:
        """Rescan upload directory to pick up files added outside this process."""
        return self._scan_upload_dir()

    def save_upload(self, file: FileStorage) -> StoredDocument:
        original_filename = file.filename or "uploaded"
        safe_name = secure_filename(original_filename)
        document_id = str(uuid.uuid4())

        # Preserve the original file extension as much as possible
        target = self._upload_dir / f"{document_id}__{safe_name}"
        file.save(target)

        size = target.stat().st_size
        file_hash = _sha256_file(target)
        guessed_type, _ = mimetypes.guess_type(target.name)
        content_type = file.mimetype or guessed_type or "application/octet-stream"

        doc = StoredDocument(
            document_id=document_id,
            original_filename=original_filename,
            content_type=content_type,
            size_bytes=size,
            file_hash=file_hash,
            path=target,
        )
        with self._lock:
            self._docs[document_id] = doc
            self._save_index_locked()
        return doc

    def get(self, document_id: str) -> StoredDocument | None:
        with self._lock:
            return self._docs.get(document_id)

    def list_documents(self) -> list[StoredDocument]:
        with self._lock:
            return list(self._docs.values())

    def find_by_hash(self, file_hash: str) -> list[StoredDocument]:
        if not file_hash:
            return []
        with self._lock:
            return [d for d in self._docs.values() if d.file_hash == file_hash]

    def delete(self, document_id: str) -> bool:
        """Delete a document from both the index and file system."""
        with self._lock:
            doc = self._docs.pop(document_id, None)
            if doc is None:
                return False
            if doc.path.exists():
                try:
                    doc.path.unlink()
                except Exception:
                    pass
            self._save_index_locked()
        return True

    def get_content(self, document_id: str) -> bytes | None:
        """Return raw file bytes for the given document."""
        doc = self.get(document_id)
        if doc is None or doc.path is None or not doc.path.exists():
            return None
        return doc.path.read_bytes()

    def _load_index(self) -> None:
        if not self._index_path.exists():
            return
        try:
            with self._index_path.open("r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            return

        if not isinstance(raw, dict):
            return

        loaded: dict[str, StoredDocument] = {}
        for doc_id, v in raw.items():
            if not isinstance(v, dict):
                continue
            rel = v.get("path")
            if not rel:
                continue
            path = (self._upload_dir / rel).resolve()
            if not path.exists() or not path.is_file():
                continue
            try:
                doc = StoredDocument(
                    document_id=str(doc_id),
                    original_filename=str(v.get("original_filename") or v.get("originalFilename") or path.name),
                    content_type=str(v.get("content_type") or v.get("contentType") or "application/octet-stream"),
                    size_bytes=int(v.get("size_bytes") or v.get("sizeBytes") or path.stat().st_size),
                    file_hash=str(v.get("file_hash") or v.get("fileHash") or _sha256_file(path)),
                    path=path,
                )
            except Exception:
                continue
            loaded[doc.document_id] = doc

        with self._lock:
            self._docs.update(loaded)

    def _scan_upload_dir(self) -> int:
        # Recover document_id and original filename from existing files
        # Format: {uuid}__{secure_filename(original)}
        added = 0
        pat = re.compile(r"^(?P<id>[0-9a-fA-F-]{16,})__(?P<name>.+)$")
        for p in self._upload_dir.iterdir():
            if not p.is_file():
                continue
            if p.name == self._index_path.name:
                continue
            m = pat.match(p.name)
            if not m:
                continue
            doc_id = m.group("id")
            original_filename = m.group("name")

            with self._lock:
                if doc_id in self._docs:
                    continue
            try:
                size = p.stat().st_size
                file_hash = _sha256_file(p)
                guessed_type, _ = mimetypes.guess_type(p.name)
                content_type = guessed_type or "application/octet-stream"
                doc = StoredDocument(
                    document_id=doc_id,
                    original_filename=original_filename,
                    content_type=content_type,
                    size_bytes=size,
                    file_hash=file_hash,
                    path=p,
                )
            except Exception:
                continue

            with self._lock:
                if doc_id in self._docs:
                    continue
                self._docs[doc_id] = doc
                self._save_index_locked()
                added += 1

        return added

    def _save_index_locked(self) -> None:
        data: dict[str, dict[str, Any]] = {}
        for doc_id, d in self._docs.items():
            # Only save relative path from upload_dir in the index
            rel = None
            try:
                rel = str(d.path.relative_to(self._upload_dir))
            except Exception:
                rel = d.path.name
            data[doc_id] = {
                "original_filename": d.original_filename,
                "content_type": d.content_type,
                "size_bytes": d.size_bytes,
                "file_hash": d.file_hash,
                "path": rel,
            }
        tmp = self._index_path.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp.replace(self._index_path)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class JobStore:
    def __init__(self, *, result_dir: Path):
        self._result_dir = result_dir
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
        result_path = self._result_dir / f"{job_id}.json"
        with result_path.open("w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        with self._lock:
            self._jobs[job_id]["status"] = "succeeded"
            self._jobs[job_id]["updatedAt"] = _now_ms()

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def load_result(self, job_id: str) -> dict[str, Any] | None:
        """Load the result JSON for a succeeded job."""
        result_path = self._result_dir / f"{job_id}.json"
        if not result_path.exists():
            return None
        with result_path.open("r", encoding="utf-8") as f:
            return json.load(f)


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)
