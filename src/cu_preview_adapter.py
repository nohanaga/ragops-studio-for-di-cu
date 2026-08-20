from __future__ import annotations

import time
import uuid
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

import requests

from src.cu_auth import build_credential, build_rest_auth_headers
from src.cu_types import CU_API_VERSION_PREVIEW, CuExecutionMode


class CuPreviewRestError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


class CuPreviewAdapter:
    api_version = CU_API_VERSION_PREVIEW

    def __init__(self) -> None:
        endpoint, credential = build_credential()
        self.endpoint = endpoint
        self.credential = credential
        self.session = requests.Session()

    def analyze_url(
        self,
        *,
        analyzer_id: str,
        url: str,
        content_range: str | None,
        processing_location: str | None,
        execution_mode: CuExecutionMode,
    ) -> dict[str, Any]:
        operation = "analyzeInline" if execution_mode == "sync" else "analyze"
        input_item: dict[str, Any] = {"url": url}
        if content_range:
            input_item["range"] = content_range
        response = self._request(
            "POST",
            self._analyzer_operation_url(analyzer_id, operation),
            params=self._analysis_params(processing_location=processing_location),
            json={"inputs": [input_item]},
            expected_statuses={200} if execution_mode == "sync" else {202},
        )
        if execution_mode == "sync":
            return self._json_object(response)
        return self._poll_from_response(response)

    def analyze_binary(
        self,
        *,
        analyzer_id: str,
        content: bytes,
        content_type: str,
        content_range: str | None,
        processing_location: str | None,
        execution_mode: CuExecutionMode,
    ) -> dict[str, Any]:
        operation = "analyzeBinaryInline" if execution_mode == "sync" else "analyzeBinary"
        params = self._analysis_params(processing_location=processing_location)
        if content_range:
            params["range"] = content_range
        response = self._request(
            "POST",
            self._analyzer_operation_url(analyzer_id, operation),
            params=params,
            data=content,
            content_type=content_type,
            expected_statuses={200} if execution_mode == "sync" else {202},
        )
        if execution_mode == "sync":
            return self._json_object(response)
        return self._poll_from_response(response)

    def get_analyzer(self, analyzer_id: str) -> dict[str, Any]:
        response = self._request(
            "GET",
            self._analyzer_url(analyzer_id),
            params={"api-version": self.api_version},
            expected_statuses={200},
        )
        return self._json_object(response)

    def create_analyzer(self, analyzer_id: str, resource: Mapping[str, Any]) -> None:
        response = self._request(
            "PUT",
            self._analyzer_url(analyzer_id),
            params={"api-version": self.api_version},
            json=dict(resource),
            expected_statuses={200, 201},
        )
        operation_location = response.headers.get("Operation-Location")
        if operation_location:
            self._poll(operation_location, return_result=False)

    def delete_analyzer(self, analyzer_id: str) -> None:
        self._request(
            "DELETE",
            self._analyzer_url(analyzer_id),
            params={"api-version": self.api_version},
            expected_statuses={200, 202, 204},
        )

    def _analysis_params(self, *, processing_location: str | None) -> dict[str, str]:
        params = {"api-version": self.api_version}
        if processing_location:
            params["processingLocation"] = processing_location
        return params

    def _analyzer_url(self, analyzer_id: str) -> str:
        safe_id = quote(analyzer_id, safe="._-")
        return f"{self.endpoint}/contentunderstanding/analyzers/{safe_id}"

    def _analyzer_operation_url(self, analyzer_id: str, operation: str) -> str:
        return f"{self._analyzer_url(analyzer_id)}:{operation}"

    def _request(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        json: Mapping[str, Any] | None = None,
        data: bytes | None = None,
        content_type: str | None = None,
        expected_statuses: set[int],
    ) -> requests.Response:
        headers = build_rest_auth_headers(self.credential)
        headers["x-ms-client-request-id"] = str(uuid.uuid4())
        if json is not None:
            headers["Content-Type"] = "application/json"
        elif content_type:
            headers["Content-Type"] = content_type

        try:
            response = self.session.request(
                method,
                url,
                params=params,
                json=json,
                data=data,
                headers=headers,
                timeout=(10, 180),
            )
        except requests.RequestException as exc:
            raise CuPreviewRestError("Content Understanding Preview request failed") from exc

        if response.status_code not in expected_statuses:
            self._raise_response_error(response)
        return response

    def _poll_from_response(self, response: requests.Response) -> dict[str, Any]:
        operation_location = response.headers.get("Operation-Location")
        if not operation_location:
            raise CuPreviewRestError(
                "Content Understanding response did not include Operation-Location"
            )
        result = self._poll(operation_location, return_result=True)
        if not isinstance(result, dict):
            raise CuPreviewRestError("Content Understanding returned an invalid result")
        return result

    def _poll(self, operation_location: str, *, return_result: bool) -> dict[str, Any] | None:
        deadline = time.monotonic() + 30 * 60
        while time.monotonic() < deadline:
            response = self._request(
                "GET",
                operation_location,
                expected_statuses={200},
            )
            payload = self._json_object(response)
            status = str(payload.get("status", "")).lower()
            if status == "succeeded":
                return payload if return_result else None
            if status in {"failed", "canceled", "cancelled"}:
                error = payload.get("error")
                message = "Content Understanding operation failed"
                if isinstance(error, Mapping) and error.get("message"):
                    message = str(error["message"])
                raise CuPreviewRestError(message)
            retry_after = response.headers.get("Retry-After", "1")
            try:
                delay = max(1.0, min(float(retry_after), 10.0))
            except ValueError:
                delay = 1.0
            time.sleep(delay)
        raise CuPreviewRestError("Content Understanding operation timed out")

    @staticmethod
    def _json_object(response: requests.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise CuPreviewRestError("Content Understanding returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise CuPreviewRestError("Content Understanding returned a non-object response")
        return payload

    @staticmethod
    def _raise_response_error(response: requests.Response) -> None:
        message = f"Content Understanding request failed with HTTP {response.status_code}"
        error_code = response.headers.get("x-ms-error-code")
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if isinstance(payload, Mapping):
            error = payload.get("error")
            if isinstance(error, Mapping):
                error_code = str(error.get("code") or error_code or "") or None
                if error.get("message"):
                    message = str(error["message"])
        if response.status_code == 429:
            message = f"{message} Model deployment capacity may be insufficient."
        raise CuPreviewRestError(
            message,
            status_code=response.status_code,
            error_code=error_code,
        )