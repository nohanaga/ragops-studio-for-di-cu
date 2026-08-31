from __future__ import annotations

from typing import Any

from src.cu_auth import build_credential
from src.cu_types import CU_API_VERSION_GA


class CuGaAdapter:
    api_version = CU_API_VERSION_GA

    def __init__(self) -> None:
        from azure.ai.contentunderstanding import ContentUnderstandingClient

        endpoint, credential = build_credential()
        self.endpoint = endpoint
        self.client = ContentUnderstandingClient(
            endpoint=endpoint,
            credential=credential,
        )

    def analyze_url(
        self,
        *,
        analyzer_id: str,
        url: str,
        content_range: str | None,
        processing_location: str | None,
    ) -> Any:
        from azure.ai.contentunderstanding.models import AnalysisInput

        poller = self.client.begin_analyze(
            analyzer_id=analyzer_id,
            inputs=[AnalysisInput(url=url, content_range=content_range)],
            processing_location=processing_location,
        )
        return poller.result()

    def analyze_binary(
        self,
        *,
        analyzer_id: str,
        content: bytes,
        content_type: str,
        content_range: str | None,
        processing_location: str | None,
    ) -> Any:
        poller = self.client.begin_analyze_binary(
            analyzer_id=analyzer_id,
            binary_input=content,
            content_type=content_type,
            content_range=content_range,
            processing_location=processing_location,
        )
        return poller.result()