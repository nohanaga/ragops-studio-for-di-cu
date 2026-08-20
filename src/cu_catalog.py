from __future__ import annotations

from typing import Any

from src.cu_types import CU_API_VERSION_GA, CU_API_VERSION_PREVIEW, CuApiProfile


_PREVIEW_TAX_ANALYZERS = {
    "prebuilt-tax.us.1041ScheduleK1",
    "prebuilt-tax.us.1120SScheduleK1",
    "prebuilt-tax.us.1065ScheduleK1",
    "prebuilt-tax.us.8865ScheduleK1",
    "prebuilt-tax.us.mn.m1",
}

_MODELS: tuple[dict[str, Any], ...] = (
    {"id": "prebuilt-read", "cat": "extraction", "sync": True},
    {"id": "prebuilt-layout", "cat": "extraction", "sync": True},
    {"id": "prebuilt-digitalParse", "cat": "extraction"},
    {"id": "prebuilt-document", "cat": "base"},
    {"id": "prebuilt-image", "cat": "base", "needsSchema": True},
    {"id": "prebuilt-audio", "cat": "base", "needsSchema": True},
    {"id": "prebuilt-video", "cat": "base", "needsSchema": True},
    {"id": "prebuilt-documentSearch", "cat": "rag"},
    {"id": "prebuilt-imageSearch", "cat": "rag"},
    {"id": "prebuilt-audioSearch", "cat": "rag"},
    {"id": "prebuilt-videoSearch", "cat": "rag"},
    {"id": "prebuilt-invoice", "cat": "financial"},
    {"id": "prebuilt-receipt", "cat": "financial"},
    {"id": "prebuilt-receipt.generic", "cat": "financial"},
    {"id": "prebuilt-receipt.hotel", "cat": "financial"},
    {"id": "prebuilt-creditCard", "cat": "financial"},
    {"id": "prebuilt-creditMemo", "cat": "financial"},
    {"id": "prebuilt-check.us", "cat": "financial", "us": True},
    {"id": "prebuilt-bankStatement.us", "cat": "financial", "us": True},
    {"id": "prebuilt-idDocument", "cat": "identity"},
    {"id": "prebuilt-idDocument.generic", "cat": "identity"},
    {"id": "prebuilt-idDocument.passport", "cat": "identity"},
    {"id": "prebuilt-healthInsuranceCard.us", "cat": "identity", "us": True},
    {"id": "prebuilt-tax.us", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.w2", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.w4", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040Senior", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040Schedule1", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040Schedule2", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040Schedule3", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040Schedule8812", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleA", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleB", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleC", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleD", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleE", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleEIC", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleF", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleH", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleJ", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleR", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1040ScheduleSE", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1095A", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1095C", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1098", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1098E", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1098T", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099Combo", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099A", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099B", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099C", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099DIV", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099G", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099INT", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099K", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099MISC", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099NEC", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099R", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099S", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099SA", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1099SSA", "cat": "tax", "us": True},
    {"id": "prebuilt-tax.us.1041ScheduleK1", "cat": "tax", "us": True, "previewOnly": True},
    {"id": "prebuilt-tax.us.1120SScheduleK1", "cat": "tax", "us": True, "previewOnly": True},
    {"id": "prebuilt-tax.us.1065ScheduleK1", "cat": "tax", "us": True, "previewOnly": True},
    {"id": "prebuilt-tax.us.8865ScheduleK1", "cat": "tax", "us": True, "previewOnly": True},
    {"id": "prebuilt-tax.us.mn.m1", "cat": "tax", "us": True, "previewOnly": True},
    {"id": "prebuilt-mortgage.us", "cat": "mortgage", "us": True},
    {"id": "prebuilt-mortgage.us.1003", "cat": "mortgage", "us": True},
    {"id": "prebuilt-mortgage.us.1004", "cat": "mortgage", "us": True},
    {"id": "prebuilt-mortgage.us.1005", "cat": "mortgage", "us": True},
    {"id": "prebuilt-mortgage.us.1008", "cat": "mortgage", "us": True},
    {"id": "prebuilt-mortgage.us.closingDisclosure", "cat": "mortgage", "us": True},
    {"id": "prebuilt-contract", "cat": "legal"},
    {"id": "prebuilt-marriageCertificate.us", "cat": "legal", "us": True},
    {"id": "prebuilt-procurement", "cat": "procurement"},
    {"id": "prebuilt-purchaseOrder", "cat": "procurement"},
    {"id": "prebuilt-payStub.us", "cat": "other", "us": True},
    {"id": "prebuilt-utilityBill", "cat": "other"},
    {"id": "prebuilt-callCenter", "cat": "other"},
    {"id": "prebuilt-documentFieldSchema", "cat": "utility"},
    {"id": "prebuilt-documentFields", "cat": "utility"},
)


def list_cu_models(api_profile: CuApiProfile) -> list[dict[str, Any]]:
    return [
        dict(model)
        for model in _MODELS
        if api_profile == "preview" or not model.get("previewOnly")
    ]


def is_preview_only_analyzer(analyzer_id: str) -> bool:
    return analyzer_id in _PREVIEW_TAX_ANALYZERS


def supports_sync(analyzer_id: str) -> bool:
    return analyzer_id in {"prebuilt-read", "prebuilt-layout"}


def build_capabilities(*, preview_enabled: bool) -> dict[str, Any]:
    return {
        "defaultProfile": "ga",
        "profiles": {
            "ga": {
                "apiVersion": CU_API_VERSION_GA,
                "enabled": True,
                "executionModes": ["async"],
            },
            "preview": {
                "apiVersion": CU_API_VERSION_PREVIEW,
                "enabled": preview_enabled,
                "executionModes": ["async", "sync"],
            },
        },
    }