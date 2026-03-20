import os
from pathlib import Path
from typing import Any, Optional

from azure.core.credentials import AzureKeyCredential
from azure.ai.documentintelligence import DocumentIntelligenceClient

# Authentication mode: "key" | "identity" | "auto" (default)
# - key:      API key authentication using DI_KEY (DI_KEY required)
# - identity: Managed ID / service principal authentication via Microsoft Entra ID (DefaultAzureCredential)
# - auto:     Use key auth if DI_KEY is present, otherwise Entra ID (backward compatible)
_AUTH_MODE_KEY = "key"
_AUTH_MODE_IDENTITY = "identity"
_AUTH_MODE_AUTO = "auto"
_VALID_AUTH_MODES = {_AUTH_MODE_KEY, _AUTH_MODE_IDENTITY, _AUTH_MODE_AUTO}


def _get_auth_mode() -> str:
    """Read and normalize the DI_AUTH_MODE environment variable."""
    mode = os.environ.get("DI_AUTH_MODE", _AUTH_MODE_AUTO).strip().lower()
    if mode not in _VALID_AUTH_MODES:
        raise RuntimeError(
            f"DI_AUTH_MODE value '{mode}' is invalid."
            f" Valid values: {', '.join(sorted(_VALID_AUTH_MODES))}"
        )
    return mode


def _build_credential(auth_mode: str):
    """Return a credential object based on the authentication mode."""
    endpoint = os.environ.get("DI_ENDPOINT")
    if not endpoint:
        raise RuntimeError("DI_ENDPOINT is not set in .env")

    if auth_mode == _AUTH_MODE_KEY:
        key = os.environ.get("DI_KEY", "").strip()
        if not key:
            raise RuntimeError(
                "DI_AUTH_MODE=key but DI_KEY is not set."
                " Please set DI_KEY in .env."
            )
        return endpoint, AzureKeyCredential(key)

    if auth_mode == _AUTH_MODE_IDENTITY:
        return endpoint, _get_default_azure_credential()

    # auto: use key auth if DI_KEY is available, otherwise Entra ID
    key = os.environ.get("DI_KEY", "").strip()
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
            "Or set DI_AUTH_MODE=key and provide DI_KEY."
        ) from exc
    return DefaultAzureCredential()


def _build_client() -> DocumentIntelligenceClient:
    """Build a DocumentIntelligenceClient based on DI_AUTH_MODE."""
    auth_mode = _get_auth_mode()
    endpoint, credential = _build_credential(auth_mode)
    return DocumentIntelligenceClient(endpoint=endpoint, credential=credential)


def _do_analyze(
    *,
    body,
    model_id: str,
    enable_high_resolution: bool = False,
    enable_formulas: bool = False,
    enable_barcodes: bool = False,
    enable_style_font: bool = False,
    pages: Optional[str] = None,
    locale: Optional[str] = None,
    string_index_type: Optional[str] = None,
    output_content_format: Optional[str] = None,
    query_fields: Optional[list[str]] = None,
    output: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Shared analysis logic. body is IO[bytes] (file handle or BytesIO)."""
    client = _build_client()

    features: list[str] = []
    if enable_high_resolution:
        features.append("ocrHighResolution")
    if enable_formulas:
        features.append("formulas")
    if enable_barcodes:
        features.append("barcodes")
    if enable_style_font:
        features.append("styleFont")

    request_options: dict[str, Any] = {}
    if features:
        request_options["features"] = features
    if pages:
        request_options["pages"] = pages
    if locale:
        request_options["locale"] = locale
    if string_index_type:
        request_options["string_index_type"] = string_index_type
    if output_content_format:
        request_options["output_content_format"] = output_content_format
    if query_fields:
        request_options["query_fields"] = query_fields
    if output:
        request_options["output"] = output

    poller = client.begin_analyze_document(model_id=model_id, body=body, **request_options)
    result = poller.result()

    # The SDK returns a model class, so convert to a JSON-serializable dict
    if hasattr(result, "to_dict"):
        return result.to_dict()  # type: ignore[no-any-return]
    if hasattr(result, "as_dict"):
        return result.as_dict()  # type: ignore[no-any-return]

    # Last resort (future compatibility)
    return {
        "modelId": getattr(result, "model_id", None),
        "content": getattr(result, "content", None),
    }


def analyze_document_file(
    *,
    file_path: Path,
    model_id: str,
    **kwargs,
) -> dict[str, Any]:
    """Analyze using a local file path."""
    with file_path.open("rb") as f:
        return _do_analyze(body=f, model_id=model_id, **kwargs)


def analyze_document_bytes(
    *,
    content: bytes,
    model_id: str,
    **kwargs,
) -> dict[str, Any]:
    """Analyze by passing raw bytes directly (for Blob Storage backend)."""
    import io
    return _do_analyze(body=io.BytesIO(content), model_id=model_id, **kwargs)
