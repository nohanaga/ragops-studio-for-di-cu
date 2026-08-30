import hashlib
import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.cu_catalog import is_preview_only_analyzer, supports_sync
from src.cu_ga_adapter import CuGaAdapter
from src.cu_preview_adapter import CuPreviewAdapter, CuPreviewRestError
from src.cu_types import (
    CU_API_VERSION_GA,
    CU_API_VERSION_PREVIEW,
    CuApiProfile,
    CuExecutionMode,
    CuRequestError,
)

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

_PREVIEW_CONFIG_KEYS: dict[str, str] = {
    "workflow": "workflow",
    "allow_in_page_segments": "allowInPageSegments",
}


def _build_client():
    """Build the GA Content Understanding SDK client."""
    return CuGaAdapter().client


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

_known_derived_analyzers: set[tuple[str, str, str]] = set()
_derived_analyzer_lock = threading.Lock()

# In-process cache for _get_root_and_config results
_analyzer_info_cache: dict[
    tuple[str, str, str], tuple[str, dict[str, Any], dict[str, str]]
] = {}
_resolved_workflow_cache: dict[tuple[str, str, str], str] = {}


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


def _derived_analyzer_id(
    source_analyzer_id: str,
    merged_config: dict[str, Any],
    *,
    api_profile: CuApiProfile,
) -> str:
    """Return a deterministic derived analyzer ID from source analyzer + merged config."""
    config_json = json.dumps(merged_config, sort_keys=True, default=str)
    h = hashlib.sha256(config_json.encode()).hexdigest()[:16]
    safe_source = source_analyzer_id.replace("-", "_").replace(".", "_")[:30]
    profile_tag = "p26" if api_profile == "preview" else "g25"
    return f"studio.{profile_tag}.{safe_source}.{h}"


def _cache_identity(api_version: str, analyzer_id: str) -> tuple[str, str, str]:
    endpoint = os.environ.get("CU_ENDPOINT", "").strip().rstrip("/")
    return endpoint, api_version, analyzer_id


def _get_root_and_config(analyzer_id: str) -> tuple[str, dict[str, Any], dict[str, str]]:
    """Return the root baseAnalyzerId, config, and models for the given analyzer.

    For already-derived analyzers (e.g. prebuilt-layout), traverse up to the
    root to obtain the baseAnalyzerId, returning the original config and models.
    For root analyzers, return (self, {}, models).
    Results are cached in-process.
    """
    cache_key = _cache_identity(CU_API_VERSION_GA, analyzer_id)
    if cache_key in _analyzer_info_cache:
        return _analyzer_info_cache[cache_key]

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
        _analyzer_info_cache[cache_key] = result
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
    _analyzer_info_cache[cache_key] = result
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

    # Inherit only explicit models. Read/Layout/Digital Parse don't need them,
    # and other analyzers can resolve resource-level defaults.
    models = dict(source_models)  # copy

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
    hash_input: dict[str, Any] = {
        "apiVersion": CU_API_VERSION_GA,
        "config": merged_config,
        "models": models,
    }
    if field_schema:
        hash_input["fieldSchema"] = field_schema
    derived_id = _derived_analyzer_id(
        source_analyzer_id,
        hash_input,
        api_profile="ga",
    )
    derived_key = _cache_identity(CU_API_VERSION_GA, derived_id)

    # Already verified
    if derived_key in _known_derived_analyzers:
        return derived_id

    with _derived_analyzer_lock:
        # Double-check
        if derived_key in _known_derived_analyzers:
            return derived_id

        client = _build_client()

        # Check if already exists (also check status)
        try:
            existing = client.get_analyzer(derived_id)
            if existing.status and "ready" in str(existing.status).lower():
                _known_derived_analyzers.add(derived_key)
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
        }
        if models:
            analyzer_kwargs["models"] = models
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
        _known_derived_analyzers.add(derived_key)
        logger.info("Derived analyzer '%s' created", derived_id)
        return derived_id


def _resolve_analyzer(
    base_analyzer_id: str,
    options: dict[str, Any] | None,
    *,
    api_profile: CuApiProfile = "ga",
) -> str:
    """Return a derived analyzer if options have config changes, otherwise return the base as-is."""
    if api_profile == "preview":
        return _ensure_preview_derived_analyzer(base_analyzer_id, options or {})
    config_kwargs = _extract_config_kwargs(options)
    extra_props = _extract_extra_rest_props(options)
    field_schema = (options or {}).get("field_schema")
    if not config_kwargs and not extra_props and not field_schema:
        return base_analyzer_id
    return _ensure_derived_analyzer(base_analyzer_id, config_kwargs, extra_props, field_schema=field_schema)


def _preview_config(options: dict[str, Any]) -> dict[str, Any]:
    config: dict[str, Any] = {}
    for key in _VALID_CONFIG_KEYS:
        value = options.get(key)
        if value not in (None, "", [], {}):
            config[_snake_to_camel(key)] = value
    for source_key, rest_key in _EXTRA_REST_KEYS.items():
        value = options.get(source_key)
        if value not in (None, "", [], {}):
            config[rest_key] = value
    for source_key, rest_key in _PREVIEW_CONFIG_KEYS.items():
        value = options.get(source_key)
        if value not in (None, "", [], {}):
            config[rest_key] = value
    return config


def _snake_to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def _normalize_preview_config_for_request(config: dict[str, Any]) -> dict[str, Any]:
    """Convert service-resolved response values back to valid create selectors."""
    normalized = dict(config)
    workflow = normalized.get("workflow")
    if isinstance(workflow, str) and "." in workflow:
        family = workflow.split(".", 1)[0].lower()
        normalized["workflow"] = "agentic" if family == "agentic" else "default"
    return normalized


def _get_preview_root_and_config(
    analyzer_id: str,
) -> tuple[str, dict[str, Any], dict[str, str]]:
    cache_key = _cache_identity(CU_API_VERSION_PREVIEW, analyzer_id)
    if cache_key in _analyzer_info_cache:
        return _analyzer_info_cache[cache_key]

    adapter = CuPreviewAdapter()
    analyzer = adapter.get_analyzer(analyzer_id)
    config = analyzer.get("config")
    response_config = dict(config) if isinstance(config, dict) else {}
    config_dict = _normalize_preview_config_for_request(response_config)
    models = analyzer.get("models")
    models_dict = dict(models) if isinstance(models, dict) else {}
    workflow = response_config.get("workflow")
    if isinstance(workflow, str):
        _resolved_workflow_cache[cache_key] = workflow

    root_id = analyzer.get("baseAnalyzerId")
    if not isinstance(root_id, str) or not root_id:
        result = (analyzer_id, {}, models_dict)
        _analyzer_info_cache[cache_key] = result
        return result

    seen = {analyzer_id}
    for _ in range(7):
        if root_id in seen:
            raise CuRequestError("Analyzer inheritance contains a cycle")
        seen.add(root_id)
        parent = adapter.get_analyzer(root_id)
        parent_base = parent.get("baseAnalyzerId")
        if not isinstance(parent_base, str) or not parent_base:
            parent_models = parent.get("models")
            if isinstance(parent_models, dict):
                models_dict = {**parent_models, **models_dict}
            break
        root_id = parent_base
    result = (root_id, config_dict, models_dict)
    _analyzer_info_cache[cache_key] = result
    return result


def _ensure_preview_derived_analyzer(
    source_analyzer_id: str,
    options: dict[str, Any],
) -> str:
    config_overrides = _preview_config(options)
    field_schema = options.get("field_schema")
    if not config_overrides and not field_schema:
        return source_analyzer_id

    root_id, original_config, models = _get_preview_root_and_config(source_analyzer_id)
    merged_config = {**original_config, **config_overrides}
    if merged_config == original_config and not field_schema:
        return source_analyzer_id

    hash_input: dict[str, Any] = {
        "apiVersion": CU_API_VERSION_PREVIEW,
        "config": merged_config,
        "models": models,
    }
    if field_schema:
        hash_input["fieldSchema"] = field_schema
    derived_id = _derived_analyzer_id(
        source_analyzer_id,
        hash_input,
        api_profile="preview",
    )
    derived_key = _cache_identity(CU_API_VERSION_PREVIEW, derived_id)
    if derived_key in _known_derived_analyzers:
        return derived_id

    with _derived_analyzer_lock:
        if derived_key in _known_derived_analyzers:
            return derived_id
        adapter = CuPreviewAdapter()
        try:
            existing = adapter.get_analyzer(derived_id)
            status = str(existing.get("status", "")).lower()
            if "ready" in status:
                _known_derived_analyzers.add(derived_key)
                _cache_resolved_workflow(derived_key, existing)
                return derived_id
            adapter.delete_analyzer(derived_id)
        except CuPreviewRestError as exc:
            if exc.status_code != 404:
                raise

        resource: dict[str, Any] = {
            "baseAnalyzerId": root_id,
            "config": merged_config,
        }
        if models:
            resource["models"] = models
        if isinstance(field_schema, dict):
            resource["fieldSchema"] = {
                "name": f"{derived_id}-schema",
                "fields": field_schema,
                "definitions": {},
            }
        adapter.create_analyzer(derived_id, resource)
        created = adapter.get_analyzer(derived_id)
        _cache_resolved_workflow(derived_key, created)
        _analyzer_info_cache[derived_key] = (root_id, merged_config, models)
        _known_derived_analyzers.add(derived_key)
        return derived_id


def _cache_resolved_workflow(
    cache_key: tuple[str, str, str],
    analyzer: dict[str, Any],
) -> None:
    config = analyzer.get("config")
    if not isinstance(config, dict):
        return
    workflow = config.get("workflow")
    if isinstance(workflow, str):
        _resolved_workflow_cache[cache_key] = workflow


def analyze_content_url(
    *,
    analyzer_id: str,
    url: str,
    content_range: str | None = None,
    processing_location: str | None = None,
    options: dict[str, Any] | None = None,
    api_profile: CuApiProfile = "ga",
    execution_mode: CuExecutionMode = "async",
) -> dict[str, Any]:
    """Analyze using Content Understanding with a URL."""
    options = options or {}
    _validate_execution(
        analyzer_id=analyzer_id,
        api_profile=api_profile,
        execution_mode=execution_mode,
        options=options,
    )
    effective_id = _resolve_analyzer(
        analyzer_id,
        options,
        api_profile=api_profile,
    )
    if api_profile == "preview":
        result_dict = CuPreviewAdapter().analyze_url(
            analyzer_id=effective_id,
            url=url,
            content_range=content_range,
            processing_location=processing_location,
            execution_mode=execution_mode,
        )
    else:
        result = CuGaAdapter().analyze_url(
            analyzer_id=effective_id,
            url=url,
            content_range=content_range,
            processing_location=processing_location,
        )
        result_dict = _result_to_dict(result)
    return _attach_studio_metadata(
        result_dict,
        requested_analyzer_id=analyzer_id,
        effective_analyzer_id=effective_id,
        api_profile=api_profile,
        execution_mode=execution_mode,
        options=options,
    )


def analyze_content_file(
    *,
    file_path: Path,
    analyzer_id: str,
    content_range: str | None = None,
    processing_location: str | None = None,
    options: dict[str, Any] | None = None,
    api_profile: CuApiProfile = "ga",
    execution_mode: CuExecutionMode = "async",
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
        api_profile=api_profile,
        execution_mode=execution_mode,
    )


def analyze_content_bytes(
    *,
    content: bytes,
    analyzer_id: str,
    content_type: str = "application/octet-stream",
    content_range: str | None = None,
    processing_location: str | None = None,
    options: dict[str, Any] | None = None,
    api_profile: CuApiProfile = "ga",
    execution_mode: CuExecutionMode = "async",
) -> dict[str, Any]:
    """Analyze by passing raw bytes directly (for Blob Storage backend)."""
    options = options or {}
    _validate_execution(
        analyzer_id=analyzer_id,
        api_profile=api_profile,
        execution_mode=execution_mode,
        options=options,
    )
    effective_id = _resolve_analyzer(
        analyzer_id,
        options,
        api_profile=api_profile,
    )
    if api_profile == "preview":
        result_dict = CuPreviewAdapter().analyze_binary(
            analyzer_id=effective_id,
            content=content,
            content_type=content_type,
            content_range=content_range,
            processing_location=processing_location,
            execution_mode=execution_mode,
        )
    else:
        result = CuGaAdapter().analyze_binary(
            analyzer_id=effective_id,
            content=content,
            content_type=content_type,
            content_range=content_range,
            processing_location=processing_location,
        )
        result_dict = _result_to_dict(result)
    return _attach_studio_metadata(
        result_dict,
        requested_analyzer_id=analyzer_id,
        effective_analyzer_id=effective_id,
        api_profile=api_profile,
        execution_mode=execution_mode,
        options=options,
    )


def _validate_execution(
    *,
    analyzer_id: str,
    api_profile: CuApiProfile,
    execution_mode: CuExecutionMode,
    options: dict[str, Any],
) -> None:
    if api_profile == "ga" and is_preview_only_analyzer(analyzer_id):
        raise CuRequestError(
            f"{analyzer_id} requires the Preview API profile",
            code="unsupported_analyzer",
        )
    if execution_mode == "sync":
        if api_profile != "preview":
            raise CuRequestError(
                "Synchronous analysis requires the Preview API profile",
                code="unsupported_execution_mode",
            )
        if not supports_sync(analyzer_id):
            raise CuRequestError(
                "Synchronous analysis supports only prebuilt-read and prebuilt-layout",
                code="unsupported_analyzer",
            )
        config_options = {
            key: value
            for key, value in options.items()
            if key not in {"content_range", "processing_location"}
            and value not in (None, "", [], {})
        }
        if config_options:
            raise CuRequestError(
                "Synchronous analysis does not support derived analyzer overrides",
                code="unsupported_sync_overrides",
            )

    if api_profile == "ga" and any(
        options.get(key) not in (None, "", [], {}) for key in _PREVIEW_CONFIG_KEYS
    ):
        raise CuRequestError(
            "Preview analyzer settings require apiProfile=preview",
            code="unsupported_feature",
        )

    if options.get("allow_in_page_segments") is True:
        if options.get("enable_segment") is not True:
            raise CuRequestError(
                "allowInPageSegments requires enableSegment=true",
                code="invalid_segmentation_config",
            )
        if options.get("segment_per_page") is True:
            raise CuRequestError(
                "allowInPageSegments and segmentPerPage are mutually exclusive",
                code="invalid_segmentation_config",
            )

    if options.get("workflow") == "agentic":
        if analyzer_id.startswith(("prebuilt-audio", "prebuilt-video", "prebuilt-image")):
            raise CuRequestError(
                "Agentic workflow supports document analyzers only",
                code="unsupported_modality",
            )
        if _contains_extract_method(options.get("field_schema")):
            raise CuRequestError(
                "Agentic workflow does not support fields using method=extract",
                code="invalid_field_method",
            )


def validate_cu_request(
    *,
    analyzer_id: str,
    api_profile: CuApiProfile,
    execution_mode: CuExecutionMode,
    options: dict[str, Any],
) -> None:
    _validate_execution(
        analyzer_id=analyzer_id,
        api_profile=api_profile,
        execution_mode=execution_mode,
        options=options,
    )


def _contains_extract_method(value: Any) -> bool:
    if isinstance(value, dict):
        if str(value.get("method", "")).lower() == "extract":
            return True
        return any(_contains_extract_method(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_extract_method(item) for item in value)
    return False


def _attach_studio_metadata(
    result: dict[str, Any],
    *,
    requested_analyzer_id: str,
    effective_analyzer_id: str,
    api_profile: CuApiProfile,
    execution_mode: CuExecutionMode,
    options: dict[str, Any],
) -> dict[str, Any]:
    api_version = (
        CU_API_VERSION_PREVIEW if api_profile == "preview" else CU_API_VERSION_GA
    )
    config_hash = hashlib.sha256(
        json.dumps(
            {
                "apiVersion": api_version,
                "analyzerId": requested_analyzer_id,
                "options": options,
            },
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
    ).hexdigest()
    workflow = _resolved_workflow_cache.get(
        _cache_identity(api_version, effective_analyzer_id)
    )
    result["_studio"] = {
        "requestedAnalyzerId": requested_analyzer_id,
        "effectiveAnalyzerId": effective_analyzer_id,
        "apiProfile": api_profile,
        "apiVersion": api_version,
        "executionMode": execution_mode,
        "resolvedWorkflow": workflow,
        "analyzerConfigHash": config_hash,
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
    }
    return result


def is_cu_configured() -> bool:
    """Check if the Content Understanding endpoint is configured."""
    return bool(os.environ.get("CU_ENDPOINT", "").strip())
