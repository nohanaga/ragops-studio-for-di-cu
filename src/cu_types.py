from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping


CU_API_VERSION_GA = "2025-11-01"
CU_API_VERSION_PREVIEW = "2026-06-01-preview"

CuApiProfile = Literal["ga", "preview"]
CuExecutionMode = Literal["async", "sync"]

_ANALYSIS_OPTION_KEYS = {"content_range", "processing_location"}


class CuRequestError(ValueError):
    """A client-visible Content Understanding request validation error."""

    def __init__(self, message: str, *, code: str = "invalid_request") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class CuAnalyzeRequest:
    document_id: str
    analyzer_id: str
    api_profile: CuApiProfile
    execution_mode: CuExecutionMode
    analysis_options: dict[str, Any]
    analyzer_overrides: dict[str, Any]

    @property
    def api_version(self) -> str:
        if self.api_profile == "preview":
            return CU_API_VERSION_PREVIEW
        return CU_API_VERSION_GA

    @property
    def legacy_options(self) -> dict[str, Any]:
        """Return the flattened options shape accepted by the existing service layer."""
        options = dict(self.analysis_options)
        config = self.analyzer_overrides.get("config")
        if isinstance(config, Mapping):
            options.update(config)
        field_schema = self.analyzer_overrides.get("field_schema")
        if field_schema not in (None, {}, []):
            options["field_schema"] = field_schema
        return options

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "CuAnalyzeRequest":
        document_id = _required_string(payload, "documentId")
        analyzer_id = _required_string(payload, "analyzerId")

        api_profile = payload.get("apiProfile", "ga")
        if api_profile not in ("ga", "preview"):
            raise CuRequestError(
                "apiProfile must be 'ga' or 'preview'",
                code="unsupported_api_profile",
            )

        execution_mode = payload.get("executionMode", "async")
        if execution_mode not in ("async", "sync"):
            raise CuRequestError(
                "executionMode must be 'async' or 'sync'",
                code="unsupported_execution_mode",
            )

        if "analysisOptions" in payload or "analyzerOverrides" in payload:
            analysis_options = _optional_object(payload, "analysisOptions")
            analyzer_overrides = _normalize_overrides(
                _optional_object(payload, "analyzerOverrides")
            )
        else:
            legacy_options = _optional_object(payload, "options")
            analysis_options = {
                key: value
                for key, value in legacy_options.items()
                if key in _ANALYSIS_OPTION_KEYS and value not in (None, "", [], {})
            }
            config = {
                key: value
                for key, value in legacy_options.items()
                if key not in _ANALYSIS_OPTION_KEYS
                and key != "field_schema"
                and value not in (None, "", [], {})
            }
            analyzer_overrides = {"config": config}
            field_schema = legacy_options.get("field_schema")
            if field_schema not in (None, {}, []):
                analyzer_overrides["field_schema"] = field_schema

        return cls(
            document_id=document_id,
            analyzer_id=analyzer_id,
            api_profile=api_profile,
            execution_mode=execution_mode,
            analysis_options=analysis_options,
            analyzer_overrides=analyzer_overrides,
        )


def _required_string(payload: Mapping[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CuRequestError(f"{key} is required")
    return value.strip()


def _optional_object(payload: Mapping[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise CuRequestError(f"{key} must be an object")
    return dict(value)


def _normalize_overrides(overrides: dict[str, Any]) -> dict[str, Any]:
    config = overrides.get("config")
    if config is None:
        config = {}
    if not isinstance(config, Mapping):
        raise CuRequestError("analyzerOverrides.config must be an object")

    normalized: dict[str, Any] = {"config": dict(config)}
    field_schema = overrides.get("fieldSchema", overrides.get("field_schema"))
    if field_schema not in (None, {}, []):
        if not isinstance(field_schema, Mapping):
            raise CuRequestError("analyzerOverrides.fieldSchema must be an object")
        normalized["field_schema"] = dict(field_schema)
    return normalized