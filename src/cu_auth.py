from __future__ import annotations

import os
from typing import Any

from azure.core.credentials import AzureKeyCredential


_AUTH_MODE_KEY = "key"
_AUTH_MODE_IDENTITY = "identity"
_AUTH_MODE_AUTO = "auto"
_VALID_AUTH_MODES = {_AUTH_MODE_KEY, _AUTH_MODE_IDENTITY, _AUTH_MODE_AUTO}
COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default"


def get_auth_mode() -> str:
    mode = os.environ.get("CU_AUTH_MODE", _AUTH_MODE_AUTO).strip().lower()
    if mode not in _VALID_AUTH_MODES:
        raise RuntimeError(
            f"CU_AUTH_MODE value '{mode}' is invalid."
            f" Valid values: {', '.join(sorted(_VALID_AUTH_MODES))}"
        )
    return mode


def build_credential() -> tuple[str, Any]:
    endpoint = os.environ.get("CU_ENDPOINT", "").strip().rstrip("/")
    if not endpoint:
        raise RuntimeError("CU_ENDPOINT is not set in .env")

    auth_mode = get_auth_mode()
    if auth_mode == _AUTH_MODE_KEY:
        key = os.environ.get("CU_KEY", "").strip()
        if not key:
            raise RuntimeError(
                "CU_AUTH_MODE=key but CU_KEY is not set. Please set CU_KEY in .env."
            )
        return endpoint, AzureKeyCredential(key)

    if auth_mode == _AUTH_MODE_IDENTITY:
        return endpoint, _get_default_azure_credential()

    key = os.environ.get("CU_KEY", "").strip()
    if key:
        return endpoint, AzureKeyCredential(key)
    return endpoint, _get_default_azure_credential()


def build_rest_auth_headers(credential: Any) -> dict[str, str]:
    if isinstance(credential, AzureKeyCredential):
        return {"Ocp-Apim-Subscription-Key": credential.key}
    token = credential.get_token(COGNITIVE_SERVICES_SCOPE)
    return {"Authorization": f"Bearer {token.token}"}


def _get_default_azure_credential():
    try:
        from azure.identity import DefaultAzureCredential
    except ImportError as exc:
        raise RuntimeError(
            "azure-identity is required for Entra ID authentication. "
            "Install azure-identity or use CU_AUTH_MODE=key."
        ) from exc
    return DefaultAzureCredential()