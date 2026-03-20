import hashlib
import json
import os
import re
import secrets
import threading
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, g, jsonify, render_template, request, send_file, send_from_directory

from src.di_service import analyze_document_file, analyze_document_bytes
from src.cu_service import analyze_content_file, analyze_content_bytes, is_cu_configured
from src.cache import ResultCache
from src.storage import DocumentStore, JobStore

load_dotenv()

APP_ROOT = Path(__file__).resolve().parent
STORAGE_DIR = APP_ROOT / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
RESULTS_DIR = STORAGE_DIR / "results"
CACHE_DIR = STORAGE_DIR / "cache"
USERTAB_DIR = APP_ROOT / "usertab"


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")

    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").strip().lower()

    if STORAGE_BACKEND == "blob":
        from src.blob_storage import BlobDocumentStore, BlobJobStore, BlobResultCache
        _account = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
        _container = os.environ.get("AZURE_STORAGE_CONTAINER_NAME", "appstorage").strip()
        if not _account:
            raise RuntimeError(
                "STORAGE_BACKEND=blob but AZURE_STORAGE_ACCOUNT_NAME is not set."
            )
        document_store = BlobDocumentStore(account_name=_account, container_name=_container)
        job_store = BlobJobStore(account_name=_account, container_name=_container)
        cache = BlobResultCache(account_name=_account, container_name=_container)
    else:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        document_store = DocumentStore(upload_dir=UPLOADS_DIR)
        job_store = JobStore(result_dir=RESULTS_DIR)
        cache = ResultCache(cache_dir=CACHE_DIR)

    # ── Security: Content-Security-Policy ──────────────────────
    @app.before_request
    def _generate_csp_nonce():
        g.csp_nonce = secrets.token_urlsafe(32)

    @app.after_request
    def set_security_headers(response):
        nonce = getattr(g, 'csp_nonce', '')
        # script-src: self + CDN (pdf.js, marked, DOMPurify) + nonce for inline module
        # style-src: 'unsafe-inline' is required to allow <style> tags inside usertab
        csp = (
            f"default-src 'self'; "
            f"script-src 'self' 'nonce-{nonce}' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
            f"worker-src 'self' blob:; "
            f"style-src 'self' 'unsafe-inline'; "
            f"img-src 'self' data:; "
            f"font-src 'self'; "
            f"connect-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
            f"frame-src 'none'; "
            f"object-src 'none'; "
            f"base-uri 'self'; "
            f"form-action 'self'"
        )
        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response
    
    # Demo safety: disable uploads to avoid unintended changes by other users.
    # (Re-enable by editing this constant.)
    UPLOADS_ENABLED = str(os.getenv("UPLOADS_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "y", "on"}

    UI_DEFAULT_LANG = str(os.getenv("UI_DEFAULT_LANG", "ja")).strip().lower()
    if UI_DEFAULT_LANG not in {"ja", "en"}:
        UI_DEFAULT_LANG = "ja"

    CU_ENABLED = is_cu_configured()

    @app.get("/")
    def index():
        return render_template("index.html", uploads_enabled=UPLOADS_ENABLED, default_lang=UI_DEFAULT_LANG, cu_enabled=CU_ENABLED, csp_nonce=g.csp_nonce)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/api/models")
    def list_models():
        # Return all prebuilt models (v4.0 GA) with categories.
        # Custom model IDs can also be entered manually in the UI.
        models = [
            # ── Document Analysis ──
            {"id": "prebuilt-read", "cat": "analysis"},
            {"id": "prebuilt-layout", "cat": "analysis"},
            {"id": "prebuilt-document", "cat": "analysis"},
            # ── Financial ──
            {"id": "prebuilt-invoice", "cat": "financial"},
            {"id": "prebuilt-receipt", "cat": "financial"},
            {"id": "prebuilt-creditCard", "cat": "financial"},
            {"id": "prebuilt-bankStatement", "cat": "financial", "us": True},
            {"id": "prebuilt-check.us", "cat": "financial", "us": True},
            {"id": "prebuilt-payStub.us", "cat": "financial", "us": True},
            {"id": "prebuilt-contract", "cat": "financial"},
            # ── Identity ──
            {"id": "prebuilt-idDocument", "cat": "identity"},
            {"id": "prebuilt-healthInsuranceCard.us", "cat": "identity", "us": True},
            {"id": "prebuilt-marriageCertificate.us", "cat": "identity", "us": True},
            # ── US Tax ──
            {"id": "prebuilt-tax.us", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.w2", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.w4", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1040", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1040.schedules", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1095A", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1095C", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1098", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1098E", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1098T", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1099", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1099SSA", "cat": "tax", "us": True},
            # ── US Mortgage ──
            {"id": "prebuilt-mortgage.us.1003", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1004", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1005", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1008", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.closingDisclosure", "cat": "mortgage", "us": True},
        ]
        return jsonify({"models": models})

    def _options_signature(options: dict[str, Any]) -> str:
        # Stable signature for cache key (includes all analysis options)
        filtered = {k: v for k, v in options.items() if v not in (None, [], "", {})}
        if not filtered:
            return ""
        raw = json.dumps(filtered, sort_keys=True, separators=(",", ":"))
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()  # noqa: S324 (demo)

    def _library_items() -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for fh in cache.list_file_hashes():
            docs = document_store.find_by_hash(fh)
            if not docs:
                continue
            # When multiple docs share the same hash, prefer the most recently modified
            docs_sorted = sorted(docs, key=lambda d: d.path.stat().st_mtime if (d.path and d.path.exists()) else 0, reverse=True)
            doc = docs_sorted[0]
            items.append(
                {
                    "document": {
                        "id": doc.document_id,
                        "filename": doc.original_filename,
                        "contentType": doc.content_type,
                        "size": doc.size_bytes,
                        "fileHash": doc.file_hash,
                        "url": f"/files/{doc.document_id}",
                    },
                    "cachedModels": cache.list_model_ids(file_hash=fh),
                    "cachedVariants": cache.list_variants(file_hash=fh),
                }
            )
        # Sort by name for easier selection
        items.sort(key=lambda x: (x.get("document", {}).get("filename") or "").lower())
        return items

    @app.post("/api/cache/exists")
    def cache_exists():
        body = request.get_json(silent=True) or {}
        file_hash = body.get("fileHash")
        model_id = body.get("modelId")
        options = body.get("options") or {}
        if not file_hash or not model_id:
            return jsonify({"error": "fileHash and modelId are required"}), 400

        sig = _options_signature(options)
        cache_model_id = f"{model_id}__{sig}" if sig else model_id
        return jsonify({"exists": cache.has(file_hash=file_hash, model_id=cache_model_id)})

    @app.get("/api/library")
    def library():
        # List files that already have a cache (previously uploaded)
        document_store.refresh_from_disk()
        return jsonify({"items": _library_items()})

    @app.post("/api/library/refresh")
    def refresh_library():
        added = document_store.refresh_from_disk()
        return jsonify({"items": _library_items(), "added": added})

    @app.delete("/api/library/<file_hash>")
    def delete_library_entry(file_hash: str):
        """Delete cache and uploaded files."""
        # Delete cache
        deleted_caches = cache.delete_file_hash(file_hash=file_hash)
        # Delete all uploaded files with the same hash
        docs = document_store.find_by_hash(file_hash)
        deleted_docs = 0
        for doc in docs:
            if document_store.delete(doc.document_id):
                deleted_docs += 1
        return jsonify({"deletedCaches": deleted_caches, "deletedDocuments": deleted_docs})

    @app.get("/api/library/<file_hash>/cache/<encoded_key>")
    def get_cached_result(file_hash: str, encoded_key: str):
        """Retrieve a cached analysis result directly."""
        result = cache.load_by_key(file_hash=file_hash, encoded_key=encoded_key)
        if result is None:
            return jsonify({"error": "cached result not found"}), 404
        return jsonify({"result": result})

    @app.post("/api/documents")
    def upload_document():
        if not UPLOADS_ENABLED:
            return jsonify({"error": "uploads are disabled"}), 403
        if "file" not in request.files:
            return jsonify({"error": "file is required"}), 400

        file = request.files["file"]
        if not file or not file.filename:
            return jsonify({"error": "file is required"}), 400

        doc = document_store.save_upload(file)
        return jsonify(
            {
                "document": {
                    "id": doc.document_id,
                    "filename": doc.original_filename,
                    "contentType": doc.content_type,
                    "size": doc.size_bytes,
                    "fileHash": doc.file_hash,
                    "url": f"/files/{doc.document_id}",
                }
            }
        )

    @app.get("/files/<document_id>")
    def get_file(document_id: str):
        doc = document_store.get(document_id)
        if doc is None:
            return jsonify({"error": "document not found"}), 404
        # Serve local file directly if available (SMB / local)
        if doc.path and doc.path.exists():
            return send_from_directory(doc.path.parent, doc.path.name, as_attachment=False)
        # Blob Storage backend
        import io as _io
        content = document_store.get_content(document_id)
        if content is None:
            return jsonify({"error": "file content not found"}), 404
        return send_file(
            _io.BytesIO(content),
            mimetype=doc.content_type,
            download_name=doc.original_filename,
            as_attachment=False,
        )

    @app.post("/api/analyze")
    def analyze():
        body = request.get_json(silent=True) or {}
        document_id = body.get("documentId")
        model_id = body.get("modelId")

        if not document_id:
            return jsonify({"error": "documentId is required"}), 400
        if not model_id:
            return jsonify({"error": "modelId is required"}), 400

        doc = document_store.get(document_id)
        if doc is None:
            return jsonify({"error": "document not found"}), 404

        options = body.get("options") or {}
        sig = _options_signature(options)
        cache_model_id = f"{model_id}__{sig}" if sig else model_id

        # Reuse cached result for the same file + model (+ options) to reduce cost
        if doc.file_hash and cache.has(file_hash=doc.file_hash, model_id=cache_model_id):
            job_id = str(uuid.uuid4())
            job_store.create(job_id=job_id, document_id=document_id, model_id=model_id)
            cached = cache.load(file_hash=doc.file_hash, model_id=cache_model_id)
            job_store.set_succeeded(job_id=job_id, result=cached)
            return jsonify({"job": {"id": job_id, "cacheHit": True}})

        job_id = str(uuid.uuid4())
        job_store.create(job_id=job_id, document_id=document_id, model_id=model_id)

        def _run_job():
            job_store.set_running(job_id)
            try:
                analysis_kwargs = dict(
                    model_id=model_id,
                    enable_high_resolution=bool(options.get("enable_high_resolution")),
                    enable_formulas=bool(options.get("enable_formulas")),
                    enable_barcodes=bool(options.get("enable_barcodes")),
                    enable_style_font=bool(options.get("enable_style_font")),
                    pages=options.get("pages"),
                    locale=options.get("locale"),
                    string_index_type=options.get("string_index_type"),
                    output_content_format=options.get("output_content_format"),
                    query_fields=options.get("query_fields"),
                    output=options.get("output"),
                )
                if doc.path and doc.path.exists():
                    result_dict = analyze_document_file(file_path=doc.path, **analysis_kwargs)
                else:
                    file_bytes = document_store.get_content(doc.document_id)
                    if not file_bytes:
                        job_store.set_failed(job_id=job_id, error="File content not available")
                        return
                    result_dict = analyze_document_bytes(content=file_bytes, **analysis_kwargs)
                if doc.file_hash:
                    cache.save(file_hash=doc.file_hash, model_id=cache_model_id, result=result_dict, options=options)
                job_store.set_succeeded(job_id=job_id, result=result_dict)
            except Exception as ex:  # noqa: BLE001 (sample app)
                job_store.set_failed(job_id=job_id, error=str(ex))

        threading.Thread(target=_run_job, daemon=True).start()
        return jsonify({"job": {"id": job_id, "cacheHit": False}})

    @app.get("/api/jobs/<job_id>")
    def get_job(job_id: str):
        job = job_store.get(job_id)
        if job is None:
            return jsonify({"error": "job not found"}), 404
        return jsonify({"job": job})

    @app.get("/api/jobs/<job_id>/result")
    def get_result(job_id: str):
        job = job_store.get(job_id)
        if job is None:
            return jsonify({"error": "job not found"}), 404
        if job["status"] != "succeeded":
            return jsonify({"error": f"job is {job['status']}"}), 409

        result = job_store.load_result(job_id)
        if result is None:
            return jsonify({"error": "result not found"}), 404
        return jsonify({"result": result})

    # ── Content Understanding API ──────────────────────────────
    @app.get("/api/cu/models")
    def list_cu_models():
        if not CU_ENABLED:
            return jsonify({"models": []})
        models = [
            # ── Content Extraction ──
            {"id": "prebuilt-read", "cat": "extraction"},
            {"id": "prebuilt-layout", "cat": "extraction"},
            # ── Base ──
            {"id": "prebuilt-document", "cat": "base"},
            {"id": "prebuilt-image", "cat": "base", "needsSchema": True},
            {"id": "prebuilt-audio", "cat": "base", "needsSchema": True},
            {"id": "prebuilt-video", "cat": "base", "needsSchema": True},
            # ── RAG ──
            {"id": "prebuilt-documentSearch", "cat": "rag"},
            {"id": "prebuilt-imageSearch", "cat": "rag", "needsSchema": True},
            {"id": "prebuilt-audioSearch", "cat": "rag", "needsSchema": True},
            {"id": "prebuilt-videoSearch", "cat": "rag", "needsSchema": True},
            # ── Financial ──
            {"id": "prebuilt-invoice", "cat": "financial"},
            {"id": "prebuilt-receipt", "cat": "financial"},
            {"id": "prebuilt-receipt.generic", "cat": "financial"},
            {"id": "prebuilt-receipt.hotel", "cat": "financial"},
            {"id": "prebuilt-creditCard", "cat": "financial"},
            {"id": "prebuilt-creditMemo", "cat": "financial"},
            {"id": "prebuilt-check.us", "cat": "financial", "us": True},
            {"id": "prebuilt-bankStatement.us", "cat": "financial", "us": True},
            # ── Identity ──
            {"id": "prebuilt-idDocument", "cat": "identity"},
            {"id": "prebuilt-idDocument.generic", "cat": "identity"},
            {"id": "prebuilt-idDocument.passport", "cat": "identity"},
            {"id": "prebuilt-healthInsuranceCard.us", "cat": "identity", "us": True},
            # ── US Tax ──
            {"id": "prebuilt-tax.us", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.w2", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.w4", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1040", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1095A", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1095C", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1098", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1098E", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1098T", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1099Combo", "cat": "tax", "us": True},
            {"id": "prebuilt-tax.us.1099SSA", "cat": "tax", "us": True},
            # ── US Mortgage ──
            {"id": "prebuilt-mortgage.us", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1003", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1004", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1005", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.1008", "cat": "mortgage", "us": True},
            {"id": "prebuilt-mortgage.us.closingDisclosure", "cat": "mortgage", "us": True},
            # ── Legal & Business ──
            {"id": "prebuilt-contract", "cat": "legal"},
            {"id": "prebuilt-marriageCertificate.us", "cat": "legal", "us": True},
            # ── Procurement ──
            {"id": "prebuilt-procurement", "cat": "procurement"},
            {"id": "prebuilt-purchaseOrder", "cat": "procurement"},
            # ── Other ──
            {"id": "prebuilt-payStub.us", "cat": "other", "us": True},
            {"id": "prebuilt-utilityBill", "cat": "other"},
            # ── Utility ──
            {"id": "prebuilt-documentFieldSchema", "cat": "utility", "needsSchema": True},
            {"id": "prebuilt-documentFields", "cat": "utility", "needsSchema": True},
        ]
        return jsonify({"models": models})

    @app.post("/api/cu/analyze")
    def cu_analyze():
        if not CU_ENABLED:
            return jsonify({"error": "Content Understanding is not configured (CU_ENDPOINT missing)"}), 503

        body = request.get_json(silent=True) or {}
        document_id = body.get("documentId")
        analyzer_id = body.get("analyzerId")
        options = body.get("options") or {}

        if not document_id:
            return jsonify({"error": "documentId is required"}), 400
        if not analyzer_id:
            return jsonify({"error": "analyzerId is required"}), 400

        doc = document_store.get(document_id)
        if doc is None:
            return jsonify({"error": "document not found"}), 404

        sig = _options_signature(options)
        if "content_categories" in options and not isinstance(options.get("content_categories"), dict):
            return jsonify({"error": "options.content_categories must be an object"}), 400

        # "cu:v8:" is the cache schema version. Bump this version when the CU SDK
        # response format changes to avoid collisions with stale cached data.
        cache_model_id = f"cu:v8:{analyzer_id}__{sig}" if sig else f"cu:v8:{analyzer_id}"

        if doc.file_hash and cache.has(file_hash=doc.file_hash, model_id=cache_model_id):
            job_id = str(uuid.uuid4())
            job_store.create(job_id=job_id, document_id=document_id, model_id=cache_model_id)
            cached = cache.load(file_hash=doc.file_hash, model_id=cache_model_id)
            job_store.set_succeeded(job_id=job_id, result=cached)
            return jsonify({"job": {"id": job_id, "cacheHit": True}})

        job_id = str(uuid.uuid4())
        job_store.create(job_id=job_id, document_id=document_id, model_id=cache_model_id)

        def _run_cu_job():
            job_store.set_running(job_id)
            try:
                if doc.path and doc.path.exists():
                    result_dict = analyze_content_file(
                        file_path=doc.path,
                        analyzer_id=analyzer_id,
                        content_range=options.get("content_range"),
                        processing_location=options.get("processing_location"),
                        options=options,
                    )
                else:
                    file_bytes = document_store.get_content(doc.document_id)
                    if not file_bytes:
                        job_store.set_failed(job_id=job_id, error="File content not available")
                        return
                    result_dict = analyze_content_bytes(
                        content=file_bytes,
                        analyzer_id=analyzer_id,
                        content_type=doc.content_type or "application/octet-stream",
                        content_range=options.get("content_range"),
                        processing_location=options.get("processing_location"),
                        options=options,
                    )
                if doc.file_hash:
                    cache.save(file_hash=doc.file_hash, model_id=cache_model_id, result=result_dict, options=options)
                job_store.set_succeeded(job_id=job_id, result=result_dict)
            except Exception as ex:  # noqa: BLE001
                job_store.set_failed(job_id=job_id, error=str(ex))

        threading.Thread(target=_run_cu_job, daemon=True).start()
        return jsonify({"job": {"id": job_id, "cacheHit": False}})

    # ── User Tabs ───────────────────────────────────────────────
    _TAB_TITLE_RE = re.compile(r"<!--\s*tab-title:\s*(.+?)\s*-->")
    _ALLOWED_LANGS = {"en", "ja"}

    def _resolve_usertab_dir(lang: str) -> Path:
        """Return the language-specific usertab directory, falling back to 'en'."""
        if lang not in _ALLOWED_LANGS:
            lang = "en"
        lang_dir = USERTAB_DIR / lang
        if lang_dir.is_dir():
            return lang_dir
        # Fallback to 'en'
        fallback = USERTAB_DIR / "en"
        return fallback if fallback.is_dir() else USERTAB_DIR

    @app.get("/api/usertabs")
    def list_usertabs():
        """List .html files under usertab/<lang>/. Use the tab-title comment as title if present."""
        lang = request.args.get("lang", "en")
        tab_dir = _resolve_usertab_dir(lang)
        tabs: list[dict[str, str]] = []
        if tab_dir.is_dir():
            for p in sorted(tab_dir.iterdir()):
                if p.suffix.lower() == ".html" and p.is_file():
                    title = p.stem  # default to filename
                    # Read only the first 256 bytes to look for tab-title
                    try:
                        head = p.read_text(encoding="utf-8")[:256]
                        m = _TAB_TITLE_RE.search(head)
                        if m:
                            title = m.group(1)
                    except Exception:
                        pass
                    tabs.append({"name": p.stem, "title": title})
        return jsonify({"tabs": tabs})

    @app.get("/api/usertabs/<name>")
    def get_usertab(name: str):
        """Return the HTML content of usertab/<lang>/<name>.html."""
        lang = request.args.get("lang", "en")
        tab_dir = _resolve_usertab_dir(lang)
        # Prevent path traversal (string check + resolve validation)
        if "/" in name or "\\" in name or ".." in name:
            return jsonify({"error": "invalid name"}), 400
        html_path = (tab_dir / f"{name}.html").resolve()
        # Ensure the resolved path is under USERTAB_DIR
        try:
            html_path.relative_to(USERTAB_DIR.resolve())
        except ValueError:
            return jsonify({"error": "invalid name"}), 400
        if not html_path.is_file() or html_path.suffix.lower() != ".html":
            return jsonify({"error": "tab not found"}), 404
        return html_path.read_text(encoding="utf-8"), 200, {"Content-Type": "text/html; charset=utf-8"}

    return app


if __name__ == "__main__":
    app = create_app()
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    app.run(host=host, port=port)



