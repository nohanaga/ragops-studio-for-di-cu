import hashlib
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

from azure.core.credentials import AzureKeyCredential

logger = logging.getLogger(__name__)

# Snake_case keys accepted by ContentAnalyzerConfig
_VALID_CONFIG_KEYS: set[str] = {
    "return_details",
    "enable_ocr",
    "enable_layout",
    "enable_formula",
    "table_format",
    "chart_format",
    "enable_figure_description",
    "enable_figure_analysis",
    "annotation_format",
    "estimate_field_source_and_confidence",
    "content_categories",
    "enable_segment",
    "segment_per_page",
    "omit_content",
}

# Keys not accepted by SDK ContentAnalyzerConfig but sent from the UI
# (exist in REST API but not in the SDK model) → put into additional_properties
_EXTRA_REST_KEYS: dict[str, str] = {
    "enable_barcode": "enableBarcode",
    "enable_annotations": "enableAnnotations",
}

# Authentication mode: "key" | "identity" | "auto" (default)
_AUTH_MODE_KEY = "key"
_AUTH_MODE_IDENTITY = "identity"
_AUTH_MODE_AUTO = "auto"
_VALID_AUTH_MODES = {_AUTH_MODE_KEY, _AUTH_MODE_IDENTITY, _AUTH_MODE_AUTO}


def _get_auth_mode() -> str:
    """Read and normalize the CU_AUTH_MODE environment variable."""
    mode = os.environ.get("CU_AUTH_MODE", _AUTH_MODE_AUTO).strip().lower()
    if mode not in _VALID_AUTH_MODES:
        raise RuntimeError(
            f"CU_AUTH_MODE value '{mode}' is invalid."
            f" Valid values: {', '.join(sorted(_VALID_AUTH_MODES))}"
        )
    return mode


def _build_credential(auth_mode: str):
    """Return a credential object based on the authentication mode."""
    endpoint = os.environ.get("CU_ENDPOINT")
    if not endpoint:
        raise RuntimeError("CU_ENDPOINT is not set in .env")

    if auth_mode == _AUTH_MODE_KEY:
        key = os.environ.get("CU_KEY", "").strip()
        if not key:
            raise RuntimeError(
                "CU_AUTH_MODE=key but CU_KEY is not set."
                " Please set CU_KEY in .env."
            )
        return endpoint, AzureKeyCredential(key)

    if auth_mode == _AUTH_MODE_IDENTITY:
        return endpoint, _get_default_azure_credential()

    # auto: use key auth if CU_KEY is available, otherwise Entra ID
    key = os.environ.get("CU_KEY", "").strip()
    if key:
        return endpoint, AzureKeyCredential(key)
    return endpoint, _get_default_azure_credential()


def _get_default_azure_credential():
    """Return DefaultAzureCredential. Provide a clear error if azure-identity is not installed."""
    try:
        from azure.identity import DefaultAzureCredential  # noqa: WPS433
    except ImportError as exc:
        raise RuntimeError(
            "azure-identity is required for Entra ID authentication.\n"
            "  pip install azure-identity\n"
            "Or set CU_AUTH_MODE=key and provide CU_KEY."
        ) from exc
    return DefaultAzureCredential()


def _build_client():
    """Build a ContentUnderstandingClient based on CU_AUTH_MODE."""
    from azure.ai.contentunderstanding import ContentUnderstandingClient

    auth_mode = _get_auth_mode()
    endpoint, credential = _build_credential(auth_mode)
    return ContentUnderstandingClient(endpoint=endpoint, credential=credential)


def _result_to_dict(result) -> dict[str, Any]:
    """Convert the SDK AnalysisResult to a serializable dict."""
    if hasattr(result, "as_dict"):
        return result.as_dict()
    if hasattr(result, "to_dict"):
        return result.to_dict()
    # Last resort
    return {"status": getattr(result, "status", None)}


# ── Derived analyzer management ─────────────────────────────
# In CU GA 2025-11-01, config is set at the analyzer definition level and
# per-request runtime overrides are not supported.
# When UI parameters change, a derived analyzer is created from the base
# analyzer and analysis is performed using that derived analyzer ID.

_known_derived_analyzers: set[str] = set()
_derived_analyzer_lock = threading.Lock()

# In-process cache for _get_root_and_config results
_analyzer_info_cache: dict[str, tuple[str, dict[str, Any], dict[str, str]]] = {}


def _extract_config_kwargs(options: dict[str, Any] | None) -> dict[str, Any]:
    """Extract kwargs for ContentAnalyzerConfig from UI options."""
    options = options or {}
    kwargs: dict[str, Any] = {}
    for key in _VALID_CONFIG_KEYS:
        value = options.get(key)
        if value in (None, "", [], {}):
            continue
        if key == "content_categories" and not isinstance(value, dict):
            raise ValueError("content_categories must be an object")
        kwargs[key] = value
    return kwargs


def _extract_extra_rest_props(options: dict[str, Any] | None) -> dict[str, Any]:
    """Extract additional properties supported by REST but not by the SDK."""
    options = options or {}
    extra: dict[str, Any] = {}
    for src_key, camel_key in _EXTRA_REST_KEYS.items():
        value = options.get(src_key)
        if value in (None, "", [], {}):
            continue
        extra[camel_key] = value
    return extra


def _derived_analyzer_id(source_analyzer_id: str, merged_config: dict[str, Any]) -> str:
    """Return a deterministic derived analyzer ID from source analyzer + merged config."""
    config_json = json.dumps(merged_config, sort_keys=True, default=str)
    h = hashlib.sha256(config_json.encode()).hexdigest()[:16]
    safe_source = source_analyzer_id.replace("-", "_").replace(".", "_")
    return f"studio.{safe_source}.{h}"


def _get_root_and_config(analyzer_id: str) -> tuple[str, dict[str, Any], dict[str, str]]:
    """Return the root baseAnalyzerId, config, and models for the given analyzer.

    For already-derived analyzers (e.g. prebuilt-layout), traverse up to the
    root to obtain the baseAnalyzerId, returning the original config and models.
    For root analyzers, return (self, {}, models).
    Results are cached in-process.
    """
    if analyzer_id in _analyzer_info_cache:
        return _analyzer_info_cache[analyzer_id]

    client = _build_client()
    analyzer = client.get_analyzer(analyzer_id)

    # Get models (completion / embedding)
    models_dict: dict[str, str] = {}
    if analyzer.models:
        if hasattr(analyzer.models, "as_dict"):
            models_dict = analyzer.models.as_dict()
        elif isinstance(analyzer.models, dict):
            models_dict = dict(analyzer.models)

    if not analyzer.base_analyzer_id:
        # Root analyzer
        result = (analyzer_id, {}, models_dict)
        _analyzer_info_cache[analyzer_id] = result
        return result

    # Derived analyzer — get config and traverse up to root
    config_dict: dict[str, Any] = {}
    if analyzer.config and hasattr(analyzer.config, "as_dict"):
        config_dict = analyzer.config.as_dict()
    root_id = analyzer.base_analyzer_id
    # Handle multi-level derivation (up to 5 levels)
    seen = {analyzer_id}
    for _ in range(5):
        if root_id in seen:
            break
        seen.add(root_id)
        parent = client.get_analyzer(root_id)
        if not parent.base_analyzer_id:
            # Also merge root's models (child's values take priority)
            if parent.models:
                parent_models = parent.models.as_dict() if hasattr(parent.models, "as_dict") else dict(parent.models)
                models_dict = {**parent_models, **models_dict}
            break
        root_id = parent.base_analyzer_id
    result = (root_id, config_dict, models_dict)
    _analyzer_info_cache[analyzer_id] = result
    return result


def _ensure_derived_analyzer(
    source_analyzer_id: str,
    config_kwargs: dict[str, Any],
    extra_props: dict[str, Any] | None = None,
    field_schema: dict[str, Any] | None = None,
) -> str:
    """Create a derived analyzer if needed and return its analyzer ID.

    If source_analyzer_id is already derived (e.g. prebuilt-layout),
    traverse up to the root baseAnalyzerId, merge original config with user-specified
    config, and create a new derived analyzer.
    If field_schema is provided, set it as ContentFieldSchema.
    """
    from azure.ai.contentunderstanding.models import ContentAnalyzer, ContentAnalyzerConfig, ContentFieldSchema, ContentFieldDefinition
    from azure.core.exceptions import ResourceNotFoundError

    # Get root base, original config, and models
    root_base_id, original_config, source_models = _get_root_and_config(source_analyzer_id)

    # Inherit source's models. Only fill in completion from defaults if missing.
    # Only inherit embedding if the source already has it
    # (prebuilt-image etc. don't support embedding, so adding it would cause errors)
    models = dict(source_models)  # copy
    if not models.get("completion"):
        client = _build_client()
        defaults = client.get_defaults()
        if hasattr(defaults, "as_dict"):
            ddict = defaults.as_dict()
        else:
            ddict = {}
        deployments = ddict.get("modelDeployments", {})
        for key in ("prebuilt-analyzer-completion",):
            if deployments.get(key):
                models["completion"] = deployments[key]
                break
        if not models.get("completion"):
            models["completion"] = "gpt-4.1"

    # Merge user-specified overrides onto original config (camelCase)
    # config_kwargs is snake_case, so ContentAnalyzerConfig converts to camelCase
    user_config_obj = ContentAnalyzerConfig(**config_kwargs)
    user_config_dict = user_config_obj.as_dict()  # camelCase
    if extra_props:
        user_config_dict.update(extra_props)

    merged_config = {**original_config, **user_config_dict}

    # ── Short-circuit: if config after user overrides is identical to source and no field_schema, no derivation needed ──
    if merged_config == original_config and not field_schema:
        logger.debug(
            "Config unchanged for '%s'; using source analyzer directly",
            source_analyzer_id,
        )
        return source_analyzer_id

    # Include field_schema in the hash input
    hash_input = dict(merged_config)
    if field_schema:
        hash_input["__field_schema__"] = field_schema
    derived_id = _derived_analyzer_id(source_analyzer_id, hash_input)

    # Already verified
    if derived_id in _known_derived_analyzers:
        return derived_id

    with _derived_analyzer_lock:
        # Double-check
        if derived_id in _known_derived_analyzers:
            return derived_id

        client = _build_client()

        # Check if already exists (also check status)
        try:
            existing = client.get_analyzer(derived_id)
            if existing.status and "ready" in str(existing.status).lower():
                _known_derived_analyzers.add(derived_id)
                logger.info("Derived analyzer '%s' already exists (ready)", derived_id)
                return derived_id
            # failed / creating etc. → delete and recreate
            logger.warning(
                "Derived analyzer '%s' exists but status=%s; deleting and recreating",
                derived_id, existing.status,
            )
            try:
                client.delete_analyzer(derived_id)
            except Exception:  # noqa: BLE001
                pass
        except ResourceNotFoundError:
            pass

        # Create: derive from root base with merged config + models
        # If field_schema is provided, build a ContentFieldSchema
        fs_obj = None
        if field_schema and isinstance(field_schema, dict):
            fs_fields = {}
            for fname, fdef in field_schema.items():
                if isinstance(fdef, dict):
                    fs_fields[fname] = ContentFieldDefinition(**fdef)
                else:
                    fs_fields[fname] = fdef
            fs_obj = ContentFieldSchema(
                name=f"{derived_id}-schema",
                fields=fs_fields,
            )

        analyzer_kwargs: dict[str, Any] = {
            "base_analyzer_id": root_base_id,
            "config": merged_config,
            "models": models,
        }
        if fs_obj is not None:
            analyzer_kwargs["field_schema"] = fs_obj
        analyzer = ContentAnalyzer(**analyzer_kwargs)
        logger.info(
            "Creating derived analyzer '%s' (root_base=%s, source=%s)",
            derived_id, root_base_id, source_analyzer_id,
        )
        poller = client.begin_create_analyzer(
            analyzer_id=derived_id,
            resource=analyzer,
        )
        poller.result()  # Wait for creation to complete
        _known_derived_analyzers.add(derived_id)
        logger.info("Derived analyzer '%s' created", derived_id)
        return derived_id


def _resolve_analyzer(
    base_analyzer_id: str,
    options: dict[str, Any] | None,
) -> str:
    """Return a derived analyzer if options have config changes, otherwise return the base as-is."""
    config_kwargs = _extract_config_kwargs(options)
    extra_props = _extract_extra_rest_props(options)
    field_schema = (options or {}).get("field_schema")
    if not config_kwargs and not extra_props and not field_schema:
        return base_analyzer_id
    return _ensure_derived_analyzer(base_analyzer_id, config_kwargs, extra_props, field_schema=field_schema)


def analyze_content_url(
    *,
    analyzer_id: str,
    url: str,
    content_range: str | None = None,
    processing_location: str | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Analyze using Content Understanding with a URL."""
    from azure.ai.contentunderstanding.models import AnalysisInput

    effective_id = _resolve_analyzer(analyzer_id, options)
    client = _build_client()
    poller = client.begin_analyze(
        analyzer_id=effective_id,
        inputs=[AnalysisInput(url=url, content_range=content_range)],
        processing_location=processing_location,
    )
    result = poller.result()
    return _result_to_dict(result)


def analyze_content_file(
    *,
    file_path: Path,
    analyzer_id: str,
    content_range: str | None = None,
    processing_location: str | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Analyze using a local file path."""
    import mimetypes

    mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"

    with file_path.open("rb") as f:
        data = f.read()

    return analyze_content_bytes(
        content=data,
        analyzer_id=analyzer_id,
        content_type=mime,
        content_range=content_range,
        processing_location=processing_location,
        options=options,
    )


def analyze_content_bytes(
    *,
    content: bytes,
    analyzer_id: str,
    content_type: str = "application/octet-stream",
    content_range: str | None = None,
    processing_location: str | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Analyze by passing raw bytes directly (for Blob Storage backend)."""
    effective_id = _resolve_analyzer(analyzer_id, options)
    client = _build_client()
    poller = client.begin_analyze_binary(
        analyzer_id=effective_id,
        binary_input=content,
        content_type=content_type,
        content_range=content_range,
        processing_location=processing_location,
    )
    result = poller.result()
    return _result_to_dict(result)


def is_cu_configured() -> bool:
    """Check if the Content Understanding endpoint is configured."""
    return bool(os.environ.get("CU_ENDPOINT", "").strip())
