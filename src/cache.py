import base64
import json
import re
from pathlib import Path
from typing import Any


class ResultCache:
    def __init__(self, *, cache_dir: Path):
        self._cache_dir = cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def has(self, *, file_hash: str, model_id: str) -> bool:
        return self._path(file_hash=file_hash, model_id=model_id).exists()

    def load(self, *, file_hash: str, model_id: str) -> dict[str, Any]:
        path = self._path(file_hash=file_hash, model_id=model_id)
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, *, file_hash: str, model_id: str, result: dict[str, Any],
             options: dict[str, Any] | None = None) -> Path:
        from datetime import datetime, timezone
        path = self._path(file_hash=file_hash, model_id=model_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Embed request metadata for later display
        result["_meta"] = {
            "savedAt": datetime.now(timezone.utc).isoformat(),
            "options": {k: v for k, v in (options or {}).items()
                        if v not in (None, [], "", {})},
        }
        with path.open("w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        return path

    def _path(self, *, file_hash: str, model_id: str) -> Path:
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        safe_model = _encode_model_id(model_id)
        return self._cache_dir / safe_hash / f"{safe_model}.json"

    def list_file_hashes(self) -> list[str]:
        # List storage/cache/<fileHash>/... directories
        out: list[str] = []
        for p in self._cache_dir.iterdir():
            if p.is_dir():
                out.append(p.name)
        out.sort()
        return out

    def delete_file_hash(self, *, file_hash: str) -> int:
        """Delete the entire cache directory for a file_hash. Returns the number of deleted JSON files."""
        import shutil
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        d = self._cache_dir / safe_hash
        if not d.exists() or not d.is_dir():
            return 0
        count = sum(1 for f in d.glob("*.json"))
        shutil.rmtree(d, ignore_errors=True)
        return count

    def list_model_ids(self, *, file_hash: str) -> list[str]:
        """Return human-readable labels for every cached variant."""
        return [v["label"] for v in self.list_variants(file_hash=file_hash)]

    def list_variants(self, *, file_hash: str) -> list[dict[str, Any]]:
        """Return all cached variants with display label, encoded key, and metadata.

        Each element: {"label": "[CU] prebuilt-layout", "key": "<b64>",
                        "savedAt": "2026-03-18T16:39:16+00:00",
                        "optionKeys": ["enable_ocr", "table_format"]}
        """
        from datetime import datetime, timezone

        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        d = self._cache_dir / safe_hash
        if not d.exists() or not d.is_dir():
            return []
        out: list[dict[str, Any]] = []
        for f in d.glob("*.json"):
            encoded_key = f.stem
            mid = _decode_model_id(encoded_key)
            if not mid:
                continue
            # Determine service prefix and strip internal version tags
            # CU cache keys: "cu:v8:analyzerName" or "cu:v8:analyzerName__sig"
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

            # Read _meta from cached JSON (lightweight: only first few KB)
            saved_at = ""
            option_keys: list[str] = []
            try:
                with f.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                meta = data.get("_meta")
                if meta and isinstance(meta, dict):
                    saved_at = meta.get("savedAt", "")
                    opts = meta.get("options")
                    if opts and isinstance(opts, dict):
                        option_keys = sorted(opts.keys())
            except Exception:  # noqa: BLE001
                pass

            # Fallback: file modification time if no _meta.savedAt
            if not saved_at:
                try:
                    mtime = f.stat().st_mtime
                    saved_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                except Exception:  # noqa: BLE001
                    pass

            out.append({
                "label": label,
                "key": encoded_key,
                "savedAt": saved_at,
                "optionKeys": option_keys,
            })
        out.sort(key=lambda v: v["label"])
        return out

    def load_by_key(self, *, file_hash: str, encoded_key: str) -> dict[str, Any] | None:
        """Load a cached result by file_hash and the base64-encoded cache key."""
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        # Validate encoded_key (allow only base64 url-safe characters)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", encoded_key):
            return None
        path = self._cache_dir / safe_hash / f"{encoded_key}.json"
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def cache_count(self, *, file_hash: str) -> int:
        """Return total number of cached result files for the given file hash."""
        safe_hash = re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64] or "unknown"
        d = self._cache_dir / safe_hash
        if not d.exists() or not d.is_dir():
            return 0
        return sum(1 for _ in d.glob("*.json"))


def _encode_model_id(model_id: str) -> str:
    # model_id can be a UUID, name, or prebuilt ID, so encode it to be filesystem-safe
    raw = (model_id or "model").encode("utf-8")
    b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return b64[:120]


def _decode_model_id(encoded: str) -> str | None:
    if not encoded:
        return None
    try:
        # urlsafe_b64decode requires padding
        pad = "=" * ((4 - (len(encoded) % 4)) % 4)
        raw = base64.urlsafe_b64decode((encoded + pad).encode("ascii"))
        return raw.decode("utf-8")
    except Exception:
        return None
