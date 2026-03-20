# FEATURES – RAGOps Studio for Document Intelligence / Content Understanding

> Comprehensive feature reference for engineers.  
> For quick start, see [README.md](README.md).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Dual-Service Support (DI / CU)](#2-dual-service-support-di--cu)
3. [Document Intelligence (DI) Analysis](#3-document-intelligence-di-analysis)
4. [Content Understanding (CU) Analysis](#4-content-understanding-cu-analysis)
5. [Model / Analyzer Picker](#5-model--analyzer-picker)
6. [PDF Viewer & BBox Overlay](#6-pdf-viewer--bbox-overlay)
7. [Image Viewer & BBox Overlay](#7-image-viewer--bbox-overlay)
8. [Media Viewer (Audio / Video)](#8-media-viewer-audio--video)
9. [Structure Viewer (2D Tree)](#9-structure-viewer-2d-tree)
10. [3D Structure Viewer](#10-3d-structure-viewer)
11. [Markdown / Raw Preview](#11-markdown--raw-preview)
12. [Result Panel (Summary / Items / JSON)](#12-result-panel-summary--items--json)
13. [Cache System](#13-cache-system)
14. [Library (Cache Browser)](#14-library-cache-browser)
15. [Result Comparison (Semantic Diff)](#15-result-comparison-semantic-diff)
16. [User Tabs (Plugin HTML Tabs)](#16-user-tabs-plugin-html-tabs)
17. [Storage Backend](#17-storage-backend)
18. [Authentication](#18-authentication)
19. [Job System](#19-job-system)
20. [i18n (Japanese / English)](#20-i18n-japanese--english)
21. [Theme System](#21-theme-system)
22. [Responsive Layout](#22-responsive-layout)
23. [Security](#23-security)
24. [Deployment (Azure Container Apps)](#24-deployment-azure-container-apps)
25. [Environment Variables Reference](#25-environment-variables-reference)
26. [API Endpoints Reference](#26-api-endpoints-reference)

---

## 1. Architecture Overview

| Layer | Technology | Notes |
|---|---|---|
| **Backend** | Flask 3.0 (Python 3.10+) | Single process, `create_app()` factory pattern |
| **Frontend** | Vanilla HTML / CSS / JS (ES modules) | No build step; single `app.js` + `styles.css` |
| **PDF rendering** | pdf.js v5 (ESM, loaded from CDN or local vendor) | Canvas rendering + SVG overlay |
| **Markdown** | marked 12.x + DOMPurify 3.x (CDN) | For CU markdown content preview |
| **Production server** | Gunicorn (`wsgi.py`) | `gunicorn -w 2 -k gthread --threads 8` |
| **Container** | Docker (`python:3.11-slim`) | Exposes port 8000 by default |

### Key Dependencies (`requirements.txt`)

| Package | Version | Purpose |
|---|---|---|
| `flask` | 3.0.3 | Web framework |
| `python-dotenv` | 1.0.1 | `.env` file loading |
| `azure-ai-documentintelligence` | 1.0.2 | DI SDK (v4.0 GA) |
| `azure-ai-contentunderstanding` | ≥1.0.0 | CU SDK (GA 2025-11-01) |
| `azure-identity` | 1.19.0 | `DefaultAzureCredential` |
| `azure-core` | 1.31.0 | Azure SDK core |
| `azure-storage-blob` | 12.24.1 | Blob Storage backend |
| `gunicorn` | 22.0.0 | Production WSGI server |

### Directory Layout

```
app.py                  ← Flask application factory
wsgi.py                 ← Gunicorn entrypoint
src/
  di_service.py         ← DI SDK wrapper (analyze_document_file / _bytes)
  cu_service.py         ← CU SDK wrapper (derived analyzer management, analyze_content_*)
  storage.py            ← Local DocumentStore / JobStore
  blob_storage.py       ← Azure Blob Storage backends
  cache.py              ← ResultCache (local filesystem)
static/
  app.js                ← All frontend logic (~6500 lines)
  styles.css            ← Theme-aware styles
  usertab.css           ← Styling for user tab plugin content
templates/
  index.html            ← Single-page Jinja2 template
usertab/
  en/*.html             ← English user tab plugins
  ja/*.html             ← Japanese user tab plugins
scripts/
  deploy_aca.ps1        ← Azure Container Apps deploy script
storage/
  uploads/              ← Uploaded files (local mode)
  results/              ← Job result JSON (local mode)
  cache/                ← Analysis result cache (local mode)
```

---

## 2. Dual-Service Support (DI / CU)

The app supports two Azure AI services in parallel:

| | Document Intelligence (DI) | Content Understanding (CU) |
|---|---|---|
| **SDK** | `azure-ai-documentintelligence` 1.0.2 | `azure-ai-contentunderstanding` ≥1.0.0 |
| **API version** | v4.0 GA | GA 2025-11-01 |
| **Built-in models** | 30 prebuilt models | 47 prebuilt analyzers |
| **Custom models** | Manual model ID input | Derived analyzer auto-creation |
| **Media support** | PDF, images | PDF, images, audio, video, Office docs |
| **Options panel** | DI-specific features & params | 16/18 Processing Configuration params (89%) |

### Service Switching

- UI provides a **service selector** (`[DI] [CU]` toggle buttons) in the left pane header.
- CU button is disabled (grayed out with tooltip) if `CU_ENDPOINT` is not configured.
- Switching services reloads the model picker, changes the options panel, and updates the page title.
- State variable: `currentService` (`'di'` | `'cu'`).

### Conditional Feature Activation

- `is_cu_configured()` checks `CU_ENDPOINT` at startup → sets `CU_ENABLED` in `window.__APP_CONFIG__`.
- CU-related API endpoints (`/api/cu/*`) return `503` if CU is not configured.

---

## 3. Document Intelligence (DI) Analysis

### Supported Features (Options)

| UI Control | API Feature | DI SDK Parameter |
|---|---|---|
| High resolution checkbox | `ocrHighResolution` | `features=["ocrHighResolution"]` |
| Formulas checkbox | `formulas` | `features=["formulas"]` |
| Barcodes checkbox | `barcodes` | `features=["barcodes"]` |
| Font/style checkbox | `styleFont` | `features=["styleFont"]` |
| Pages input | Page range filter | `pages="1-3,5"` |
| Locale input | OCR language hint | `locale="ja-JP"` |
| Output content format dropdown | Content format | `output_content_format="markdown"` |
| Query fields input | Add-on field extraction | `query_fields=["FieldA","FieldB"]` |

### Analysis Flow

1. Client sends `POST /api/analyze` with `{ documentId, modelId, options }`.
2. Backend checks cache (file SHA-256 + model + options SHA-1 signature).
3. If cache miss → spawns `threading.Thread` → calls `analyze_document_file()` or `analyze_document_bytes()`.
4. DI SDK: `client.begin_analyze_document(model_id, body, **features)` → polls for result.
5. Result converted to dict via `.to_dict()` / `.as_dict()`.
6. Result saved to cache + job store → client polls `GET /api/jobs/<id>`.

### Custom Model ID

- Users can override the picker selection by typing a custom model ID (UUID or name).
- The custom ID field is only visible in DI mode (hidden when CU is selected).

---

## 4. Content Understanding (CU) Analysis

### Supported Processing Configuration Parameters (16/18)

| Category | Parameter | UI Control | SDK Key |
|---|---|---|---|
| **General** | Return details | Dropdown (bool) | `return_details` |
| | Omit content | Dropdown (bool) | `omit_content` |
| | Field source/confidence | Dropdown (bool) | `estimate_field_source_and_confidence` |
| **Document extraction** | OCR | Dropdown (bool) | `enable_ocr` |
| | Layout | Dropdown (bool) | `enable_layout` |
| | Formula | Dropdown (bool) | `enable_formula` |
| | Barcode | Dropdown (bool) | `enable_barcode` |
| | Figure description | Dropdown (bool) | `enable_figure_description` |
| | Figure analysis | Dropdown (bool) | `enable_figure_analysis` |
| | Annotations | Dropdown (bool) | `enable_annotations` |
| **Output format** | Table format | Dropdown (html/markdown) | `table_format` |
| | Chart format | Dropdown (chartJs/markdown) | `chart_format` |
| | Annotation format | Dropdown (none/markdown) | `annotation_format` |
| **Classification / Segmentation** | Enable segment | Dropdown (bool) | `enable_segment` |
| | Segment per page | Dropdown (bool) | `segment_per_page` |
| | Content categories | JSON textarea | `content_categories` |

### Additional Parameters

| Parameter | UI Control | CU API Parameter |
|---|---|---|
| Content range | Text input | `content_range` (request-level, not config) |
| Processing location | Dropdown (global/geography/dataZone) | `processing_location` (request-level) |

### Field Schema Editor

For analyzers requiring field schemas (marked with `needsSchema: true`, e.g., `prebuilt-image`, `prebuilt-audio`, `prebuilt-video`):

- **Table mode**: Interactive table editor (field name, type dropdown, description). Add/remove rows dynamically.
- **JSON mode**: Raw JSON textarea for advanced users.
- Supported field types: `string`, `number`, `integer`, `boolean`, `date`, `time`, `array`, `object`.
- The schema is sent as `field_schema` in the options payload.

### Derived Analyzer Auto-Management

CU GA (2025-11-01) does not support per-request config overrides. When UI options differ from the base analyzer's config:

1. **`_resolve_analyzer()`** extracts config kwargs and checks if they differ from the base.
2. **`_get_root_and_config()`** traverses the analyzer hierarchy (up to 5 levels) to find the root `baseAnalyzerId`, original config, and model deployments.
3. **`_derived_analyzer_id()`** generates a deterministic ID: `studio.<safe_source>.<sha256_16char>`.
4. **`_ensure_derived_analyzer()`** checks if the derived analyzer already exists (with status check). If not, creates it via `client.begin_create_analyzer()`.
5. Results are cached in `_known_derived_analyzers` (in-process set) and `_analyzer_info_cache` (dict).
6. Thread-safe: uses `_derived_analyzer_lock` (threading.Lock).
7. If the derived analyzer exists but has a non-ready status, it is deleted and recreated.

### CU Analysis Flow

1. Client sends `POST /api/cu/analyze` with `{ documentId, analyzerId, options }`.
2. Cache key uses version prefix: `cu:v8:<analyzerId>__<optionsSig>`.
3. If cache miss → spawns thread → calls `analyze_content_file()` / `analyze_content_bytes()`.
4. CU SDK: `client.begin_analyze_binary()` (for bytes) or file-based analysis.
5. Result normalized for UI via `normalizeCuResultForUi()`.

---

## 5. Model / Analyzer Picker

### Rich Model Picker UI

- **Dropdown button** with current selection label + filter input.
- **Text search filter**: real-time filtering by model ID.
- **Category groups**: models are grouped by category (analysis, financial, identity, tax, mortgage, etc.).
- **US-only toggle**: checkbox to show/hide US-specific models (marked with `us: true`).
- **Category labels** are translated per the current language.

### DI Models (30 prebuilt)

| Category | Models |
|---|---|
| Document Analysis | `prebuilt-read`, `prebuilt-layout`, `prebuilt-document` |
| Financial | `prebuilt-invoice`, `prebuilt-receipt`, `prebuilt-creditCard`, `prebuilt-bankStatement` (US), `prebuilt-check.us`, `prebuilt-payStub.us`, `prebuilt-contract` |
| Identity | `prebuilt-idDocument`, `prebuilt-healthInsuranceCard.us`, `prebuilt-marriageCertificate.us` |
| US Tax | `prebuilt-tax.us`, `prebuilt-tax.us.w2`, `prebuilt-tax.us.w4`, `prebuilt-tax.us.1040`, etc. (11 models) |
| US Mortgage | `prebuilt-mortgage.us.1003`, `prebuilt-mortgage.us.1004`, `prebuilt-mortgage.us.1005`, `prebuilt-mortgage.us.1008`, `prebuilt-mortgage.us.closingDisclosure` |

### CU Analyzers (47 prebuilt)

| Category | Analyzers |
|---|---|
| Content Extraction | `prebuilt-read`, `prebuilt-layout` |
| Base | `prebuilt-document`, `prebuilt-image`*, `prebuilt-audio`*, `prebuilt-video`* |
| RAG | `prebuilt-documentSearch`, `prebuilt-imageSearch`*, `prebuilt-audioSearch`*, `prebuilt-videoSearch`* |
| Financial | `prebuilt-invoice`, `prebuilt-receipt`, `prebuilt-receipt.generic`, `prebuilt-receipt.hotel`, `prebuilt-creditCard`, `prebuilt-creditMemo`, `prebuilt-check.us`, `prebuilt-bankStatement.us` |
| Identity | `prebuilt-idDocument`, `prebuilt-idDocument.generic`, `prebuilt-idDocument.passport`, `prebuilt-healthInsuranceCard.us` |
| US Tax | `prebuilt-tax.us`, `prebuilt-tax.us.w2`, `prebuilt-tax.us.w4`, etc. (11 models) |
| US Mortgage | `prebuilt-mortgage.us`, `prebuilt-mortgage.us.1003`, etc. (6 models) |
| Legal & Business | `prebuilt-contract`, `prebuilt-marriageCertificate.us` |
| Procurement | `prebuilt-procurement`, `prebuilt-purchaseOrder` |
| Other | `prebuilt-payStub.us`, `prebuilt-utilityBill` |
| Utility | `prebuilt-documentFieldSchema`*, `prebuilt-documentFields`* |

\* _Requires field schema definition_

---

## 6. PDF Viewer & BBox Overlay

### Rendering Pipeline

1. **pdf.js v5 ESM** loaded from CDN (fallback: `static/vendor/pdfjs/` for offline use).
2. PDF rendered to `<canvas>` element.
3. SVG `<svg>` overlay positioned absolutely on top of canvas.
4. Bounding boxes (BBox) drawn as SVG `<path>` elements using polygon coordinates.

### BBox Overlay Modes (10 types)

| Mode | CSS Class | Description |
|---|---|---|
| `none` | — | No overlay |
| `lines` | `bbox--lines` | Text lines |
| `words` | `bbox--words` | Individual words |
| `paragraphs` | `bbox--paragraphs` | Paragraph blocks |
| `figures` | `bbox--figures` | Figures + caption regions |
| `formulas` | `bbox--formulas` | Mathematical formulas |
| `barcodes` | `bbox--barcodes` | Barcodes and QR codes |
| `tables` | `bbox--tables` | Table cells with role indicators |
| `keyValuePairs` | `bbox--kv` | Key-value pair regions |
| `selectionMarks` | `bbox--selection` | Checkboxes / radio buttons |

### Interaction

- **Hover tooltip**: shows content text, role, type info for each bounding box.
- **Click → JSON viewer**: clicking a bbox opens the corresponding JSON path in the Response JSON tab.
- **Responsive touch**: tap shows tooltip; tap elsewhere dismisses.
- **Page navigation**: `Prev` / `Next` buttons + page dropdown selector.
- **Performance guard**: `MAX_OVERLAY_SHAPES = 2500` to prevent browser slowdown.

### Coordinate System

- DI provides `boundingRegions[].polygon` arrays (8 floats = 4 corners).
- Coordinates are in the page's unit system (`page.width` × `page.height`).
- `polygonToPath()` transforms DI coordinates → canvas pixel coordinates.

---

## 7. Image Viewer & BBox Overlay

- Non-PDF image files (JPEG, PNG, TIFF, etc.) are rendered as `<img>` elements.
- Same SVG overlay system as PDF viewer, using `naturalWidth` / `naturalHeight` for coordinate mapping.
- BBox drawn after analysis results arrive and page dimensions are available from DI response.

---

## 8. Media Viewer (Audio / Video)

- Detects audio/video by MIME type or file extension.
- Audio extensions: `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.wma`
- Video extensions: `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`
- Renders native HTML5 `<audio>` or `<video>` element with controls.
- **Media tab** appears automatically in preview tabs when a media file is loaded.
- Primarily useful with CU analyzers (`prebuilt-audio`, `prebuilt-video`, etc.).

---

## 9. Structure Viewer (2D Tree)

- **Structure tab** in the preview area.
- Displays a tree view of `paragraphs` and `sections` from the analysis result.
- Each node shows its role (title, sectionHeading, footnote, pageHeader, pageFooter, etc.).
- Allows quick structural understanding of document layout.

---

## 10. 3D Structure Viewer

> 🥚 **Easter egg**: This is a joke feature, not a practical tool. It’s here for visual impact and fun — not part of the actual analysis workflow.

An interactive 3D exploded view of document elements using pure CSS 3D transforms (no WebGL).

### Controls

| Control | Function |
|---|---|
| **Mode** button | `Current page` / `All pages` |
| **Text** checkbox | Show/hide text content on elements |
| **Explode** slider | 0–80px layer spacing between element types |
| **Zoom** slider | 60%–160% zoom |
| **Drag** | Rotate the 3D scene (mouse/touch) |
| **Scroll wheel** | Zoom in/out |
| **Click element** | Opens inspector panel with element details |

### Element Types

Each document element type is rendered as a colored layer:

- Lines, Words, Paragraphs, Tables, Key-Value Pairs, Selection Marks, Figures, Formulas, Barcodes, Sections

### Filter Toggles

- Per-type toggle buttons with element counts.
- Disabled types are hidden from the 3D scene.
- State (mode, explode, zoom, showText, enabled types) persisted to `localStorage`.

### Implementation

- CSS `perspective` on stage, `transform: translate3d() / rotateX() / rotateY()` on scene.
- Each element is a `<div>` with absolute positioning calculated from DI page coordinates.
- `renderStructure3D()` rebuilds the scene whenever the result changes, page switches, or filters change.

---

## 11. Markdown / Raw Preview

- **Markdown tab**: Renders CU `contents[].markdown` using `marked.parse()` (sanitized).
- **Raw tab**: Shows the raw markdown text as-is.
- For DI: enabled when `output_content_format=markdown` is selected.
- For CU: enabled when any content has non-empty `markdown` field.
- Both tabs are `disabled` (grayed) when no markdown content is available.
- Auto-activates Markdown tab when CU results contain markdown.

---

## 12. Result Panel (Summary / Items / JSON)

### Tabs

| Tab | Content |
|---|---|
| **Summary** | Model ID, API version, content length, page count, paragraph/table/figure/style counts |
| **Items** | Hierarchical `<details>` tree: Pages → Lines → Words, Paragraphs, Tables (rendered as HTML `<table>`), Key-Value Pairs, Figures, Styles, Documents/Fields. CU: Contents → Fields with confidence badges |
| **Response JSON** | Collapsible JSON tree viewer with syntax highlighting. Expand All / Collapse All buttons. Download JSON button |
| **Request JSON** | Shows the request payload that was sent to the API. Useful for debugging and reproducing calls |

### CU-Specific Items View

- For CU results, each `contents[]` entry shown as a collapsible section.
- Metadata: kind, path, MIME type, page range, markdown length, field count.
- Fields displayed with name, value, and **confidence badge** (color-coded: ≥80% green, ≥50% yellow, <50% red).
- Clicking a field opens the corresponding path in the JSON viewer.

### JSON Viewer

- Recursive collapsible tree built from the result object.
- Array/Object nodes show item count.
- Strings, numbers, booleans, nulls are color-coded.
- Long strings are truncated with `title` for full text on hover.
- `openJsonViewerPath(path)` programmatically opens a deep path (used by BBox click and field click).

---

## 13. Cache System

### Design

- **Purpose**: Avoid redundant API calls for the same file + model + options combination.
- **Cache key**: `SHA-256(file_content)` → directory, `base64url(model_id)` → filename.
- **Options signature**: `SHA-1(json(sorted_options))` appended to model_id as `model_id__sig`.
- **CU version prefix**: `cu:v8:<analyzer_id>` — version bumped when SDK response format changes.

### Local Cache (`ResultCache` in `cache.py`)

```
storage/cache/
  <file_hash_hex>/
    <base64url_model_id>.json
    <base64url_model_id__sig>.json
```

- `has()` / `load()` / `save()` — simple JSON file read/write.
- `list_file_hashes()` — scan directories.
- `list_variants()` — return structured metadata (label, key, savedAt, optionKeys) by reading `_meta` from each JSON.
- `load_by_key()` — load by file_hash + encoded key (validated for path traversal safety).
- `delete_file_hash()` — `shutil.rmtree` entire hash directory.
- `cache_count()` — count JSON files per hash.

### Blob Cache (`BlobResultCache` in `blob_storage.py`)

- Same interface, stored at `cache/{file_hash}/{encoded_model_id}.json` in Azure Blob Storage.
- Uses `DefaultAzureCredential` — no storage account key.

### Metadata Embedding

Each cached result has `_meta` appended:

```json
{
  "_meta": {
    "savedAt": "2026-03-18T16:39:16+00:00",
    "options": { "enable_ocr": true, "table_format": "html" }
  }
}
```

---

## 14. Library (Cache Browser)

### UI

- **Library tab** in the left input pane.
- Shows **card list** of cached files — each card shows filename, content type, file size, file hash.
- Each card expands to show **variants** (different model/option combinations cached for that file).
- Variant entries show: service label (`[DI]`/`[CU]`), model name, `(+options)` indicator, saved timestamp, option keys.
- **Load button**: instantly loads a cached result without re-calling the API.
- **Delete button**: deletes all cache entries + uploaded file for that hash.
- **Checkboxes**: select variants for comparison mode.

### Backend API

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/library` | GET | List all cached files with their variants |
| `POST /api/library/refresh` | POST | Re-scan upload directory for newly added files |
| `DELETE /api/library/<file_hash>` | DELETE | Delete cache + uploaded files for a hash |
| `GET /api/library/<file_hash>/cache/<encoded_key>` | GET | Load a specific cached result |
| `POST /api/cache/exists` | POST | Check if cache exists for file_hash + model + options |

### Library Refresh

- `POST /api/library/refresh` calls `document_store.refresh_from_disk()`.
- Scans upload directory for files matching `{uuid}__{filename}` pattern.
- Useful for picking up files placed directly into the `storage/uploads/` directory.

---

## 15. Result Comparison (Semantic Diff)

### How It Works

1. Select 2+ variants from the Library using checkboxes.
2. Click **Compare** button.
3. Backend fetches each cached result JSON.
4. Frontend performs **semantic diff**:
   - Flattens each JSON into `Map<dotPath, value>` using `flattenJson()`.
   - Collects all unique paths across results.
   - Identifies differences: paths where values differ between any two results.
5. Renders a **comparison table**:
   - Rows = JSON paths (hierarchically indented).
   - Columns = selected results.
   - Cells color-coded: `added` (green), `removed` (red), `changed` (yellow), `unchanged`.

### Controls

| Button | Action |
|---|---|
| **Expand All** | Expand all collapsible container rows |
| **Collapse All** | Collapse all container rows |
| **Diffs Only** | Toggle to show only rows with differences |
| **Close** | Hide the comparison overlay |

### Statistics

Displays: total paths, different paths, same paths.

---

## 16. User Tabs (Plugin HTML Tabs)

### Mechanism

1. Place `.html` files under `usertab/<lang>/` (e.g., `usertab/en/my-tab.html`, `usertab/ja/my-tab.html`).
2. On load, `GET /api/usertabs?lang=<lang>` returns the list of available tabs.
3. Each tab's HTML is fetched via `GET /api/usertabs/<name>?lang=<lang>`.
4. HTML is **sanitized with DOMPurify** (strict allowlist: no `<script>`, `<iframe>`, `<form>`, `<input>`, etc.; no `on*` event attributes).
5. Tabs appear in the right result panel after the built-in tabs.

### Tab Title

- Add `<!-- tab-title: My Custom Tab -->` in the first 256 bytes of the HTML file.
- If absent, the filename stem is used as the title.

### Language Fallback

- Language-specific directory: `usertab/<lang>/`.
- Falls back to `usertab/en/` if the requested language directory doesn't exist.

### Built-in User Tabs

> **Note**: User tabs are a **demo-only feature**. The bundled tabs are static HTML mockups that simulate AI agent execution results for various business scenarios. No actual agent invocation or dynamic processing is performed. They serve as samples to illustrate how a business agent's output *would look* when combined with document extraction results.

| Tab | File | Description |
|---|---|---|
| Character Validation | `char-validation.html` | Character validation agent execution result mockup |
| FSA Risk Assessment | `fsa-risk-assessment.html` | FSA risk assessment agent execution result mockup |
| Legal Clause Check | `legal-clause-check.html` | Legal clause check agent execution result mockup |

### Data Access API

User tabs can access result data via `window.__USERTAB_API__` (exposed by the main app). This can also be used for prototyping future agent integrations.

### Security

- Path traversal prevented: name must not contain `/`, `\`, or `..`.
- Resolved path validated against `USERTAB_DIR`.
- HTML sanitized with DOMPurify strict configuration.

---

## 17. Storage Backend

### Local Mode (default)

```
STORAGE_BACKEND=local
```

| Store | Directory | Format |
|---|---|---|
| `DocumentStore` | `storage/uploads/` | `{uuid}__{secure_filename}` + `index.json` |
| `JobStore` | `storage/results/` | `{job_id}.json` |
| `ResultCache` | `storage/cache/` | `{file_hash}/{base64_model}.json` |

- Index file (`index.json`) tracks document metadata for fast lookup.
- Atomic index writes: `tmp → rename` to avoid corruption.
- `refresh_from_disk()`: re-scans upload dir to discover externally-added files.
- File hash computed via SHA-256 in 1MB chunks.

### Blob Mode

```
STORAGE_BACKEND=blob
AZURE_STORAGE_ACCOUNT_NAME=<account>
AZURE_STORAGE_CONTAINER_NAME=appstorage    # default
```

| Store | Blob Prefix | Format |
|---|---|---|
| `BlobDocumentStore` | `uploads/` | `uploads/{uuid}__{filename}` + `uploads/index.json` |
| `BlobJobStore` | `results/` | `results/{job_id}.json` |
| `BlobResultCache` | `cache/` | `cache/{file_hash}/{base64_model}.json` |

- Uses `DefaultAzureCredential` (Managed Identity / Entra ID) — **no storage account key**.
- Auto-creates container if it doesn't exist.
- Thread-safe with `threading.Lock` for index operations.
- Scan-based recovery if `index.json` is missing.

### Interface Compatibility

Both `DocumentStore` / `BlobDocumentStore` share the same public API:
- `save_upload(file)`, `get(document_id)`, `get_content(document_id)`, `list_documents()`, `find_by_hash(file_hash)`, `delete(document_id)`, `refresh_from_disk()`.

Same for `JobStore` / `BlobJobStore` and `ResultCache` / `BlobResultCache`.

---

## 18. Authentication

### DI Authentication (`DI_AUTH_MODE`)

| Mode | Env Value | Behavior |
|---|---|---|
| **Auto** (default) | `auto` | Key auth if `DI_KEY` is set, else `DefaultAzureCredential` |
| **Key** | `key` | Requires `DI_KEY` |
| **Identity** | `identity` | Uses `DefaultAzureCredential` (no key needed) |

### CU Authentication (`CU_AUTH_MODE`)

| Mode | Env Value | Behavior |
|---|---|---|
| **Auto** (default) | `auto` | Key auth if `CU_KEY` is set, else `DefaultAzureCredential` |
| **Key** | `key` | Requires `CU_KEY` |
| **Identity** | `identity` | Uses `DefaultAzureCredential` (no key needed) |

### Blob Storage Authentication

- Always uses `DefaultAzureCredential` — storage account key is never used.
- Requires `Storage Blob Data Contributor` role assignment.

### Implementation

- `_get_auth_mode()` reads & validates the env var.
- `_build_credential()` returns `(endpoint, credential)` tuple.
- `_get_default_azure_credential()` provides a clear error if `azure-identity` is not installed.

---

## 19. Job System

### Job Lifecycle

```
queued → running → succeeded / failed
```

### Job Store (in-memory + filesystem/blob)

- Job metadata stored in-memory (`dict` with `threading.Lock`).
- Result JSON persisted to filesystem (local) or blob storage (blob mode).
- Each job has: `id`, `documentId`, `modelId`, `status`, `error`, `createdAt`, `updatedAt`.
- Timestamps are Unix milliseconds (`int(time.time() * 1000)`).

### Client-Side Polling

- After `POST /api/analyze` or `POST /api/cu/analyze`, the client receives `{ job: { id, cacheHit } }`.
- If `cacheHit=true`: result is immediately available.
- Otherwise: client polls `GET /api/jobs/<id>` at intervals until status is `succeeded` or `failed`.
- On success: fetches `GET /api/jobs/<id>/result`.

### Background Threads

- Analysis runs in `threading.Thread(target=_run_job, daemon=True)`.
- Daemon threads ensure clean process shutdown.

---

## 20. i18n (Japanese / English)

### Implementation

- **Client-side only**: no server round-trip for language switching.
- Translation dictionary: `I18N` object in `app.js` with `ja` and `en` keys.
- ~500 translation keys covering all UI labels, statuses, tooltips, error messages.
- `tr(key, vars)` function with variable interpolation (`{name}` placeholders).

### DOM Translation

- Elements tagged with `data-i18n="key"` → `textContent` updated.
- Elements tagged with `data-i18n-placeholder="key"` → `placeholder` updated.
- Elements tagged with `data-i18n-aria-label="key"` → `aria-label` updated.
- Elements tagged with `data-i18n-title="key"` → `title` updated.
- `applyTranslationsToDom()` called on language change.

### Language Selection Priority

1. `localStorage` saved preference (`diLang`).
2. Server-side default (`UI_DEFAULT_LANG` env var → `window.__APP_CONFIG__.defaultLang`).
3. Fallback: `ja`.

### Model Labels

- `MODEL_LABELS` object provides human-readable names for each model ID in both languages.
- e.g., `'prebuilt-invoice': { ja: '請求書', en: 'Invoice' }`.

---

## 21. Theme System

### Available Themes (5)

| Theme ID | Name |
|---|---|
| `dark` | Dark (default) |
| `light` | Light |
| `midnight` | Midnight |
| `forest` | Forest |
| `solarized` | Solarized |

### Implementation

- CSS custom properties define all colors per theme.
- `document.body.dataset.theme` attribute drives CSS selectors.
- Theme selection persisted to `localStorage` (`diTheme`).
- Theme menu dropdown in the header with translated labels.

---

## 22. Responsive Layout

### Desktop (≥1025px)

- **3-pane layout**: Left (Input/Model) | Center (Preview) | Right (Results).
- **Resizable splitters**: drag-to-resize between panes.
- Pane widths saved to `localStorage` (`diPaneWidths`).
- Constraints: min left 240px, min center 320px, min right 320px, max left 700px, max right 900px.

### Mobile (≤1024px)

- **Tabbed layout**: 3 tabs (Input, Preview, Results) — only one visible at a time.
- Tab selection saved to `localStorage` (`diMainTab`).
- Splitters hidden.
- `main--tabbed` CSS class applied.

### Input Pane Sub-Tabs

- **Input tab**: File upload + model picker + options.
- **Library tab**: Cache browser.
- Sub-tab selection persisted to `localStorage` (`diInputPaneTab`).

---

## 23. Security

### Content Security Policy (CSP)

Applied via `@app.after_request`:

```
default-src 'self';
script-src 'self' 'nonce-{nonce}' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self'
```

- **CSP nonce**: generated per-request via `secrets.token_urlsafe(32)`, injected into inline `<script>` tags.

### Additional Security Headers

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |

### Upload Safety

- Uploads enabled by default (`UPLOADS_ENABLED=true`).
- `werkzeug.utils.secure_filename()` used for all file names.
- Uploaded files stored as `{uuid}__{secure_filename}` — UUID prevents name collisions.

### Path Traversal Prevention

- Cache file_hash sanitized: `re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64]`.
- User tab names validated: no `/`, `\`, `..`; resolved path checked against `USERTAB_DIR`.
- Cache encoded_key validated: `re.fullmatch(r"[A-Za-z0-9_-]+", encoded_key)`.

### User Tab Sanitization

- DOMPurify with strict allowlists.
- Explicitly forbidden: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, all `<input>` variants, `<meta>`, `<link>`, `<base>`.
- Explicitly forbidden attributes: all `on*` event handlers.

---

## 24. Deployment (Azure Container Apps)

### Deploy Script (`scripts/deploy_aca.ps1`)

PowerShell script that automates the full deployment:

1. **Resource Group** creation (if not exists).
2. **Azure Container Registry (ACR)** creation + Docker build + push.
3. **Log Analytics Workspace** creation.
4. **Container Apps Environment** creation.
5. **Storage setup** (SMB or Blob mode).
6. **Identity setup** (if using Managed Identity auth).
7. **Container App** creation or update.

### Storage Modes

| Mode | Method | Auth |
|---|---|---|
| **SMB** (default) | Azure Files volume mount at `/app/storage` | Storage account key (SMB constraint) |
| **Blob** | Blob SDK direct R/W | Managed Identity (`DefaultAzureCredential`) |

### Auth Modes (per service)

| Mode | Method | Deploy Config |
|---|---|---|
| **Key** (default) | API key as Container Apps secret | `-DiAuthMode key` / `-CuAuthMode key` |
| **Identity** | System-assigned MI + `Cognitive Services User` role | `-DiAuthMode identity` / `-CuAuthMode identity` |

### Deployment Patterns

- **DI only + key + SMB**: Simplest setup.
- **DI only + identity + blob**: Fully keyless.
- **DI + CU**: Both services, any auth combination.
- **CU only**: Just Content Understanding.

### Container Configuration

- Base image: `python:3.11-slim`
- Server: `gunicorn -w 2 -k gthread --threads 8`
- Default port: `8000`

---

## 25. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DI_ENDPOINT` | Yes* | — | Document Intelligence endpoint URL |
| `DI_KEY` | Conditional | — | DI API key (required for key/auto mode) |
| `DI_AUTH_MODE` | No | `auto` | `key` / `identity` / `auto` |
| `CU_ENDPOINT` | Yes* | — | Content Understanding endpoint URL |
| `CU_KEY` | Conditional | — | CU API key (required for key/auto mode) |
| `CU_AUTH_MODE` | No | `auto` | `key` / `identity` / `auto` |
| `STORAGE_BACKEND` | No | `local` | `local` / `blob` |
| `AZURE_STORAGE_ACCOUNT_NAME` | Conditional | — | Required for blob mode |
| `AZURE_STORAGE_CONTAINER_NAME` | No | `appstorage` | Blob container name |
| `UPLOADS_ENABLED` | No | `true` | Enable file uploads (`true`/`false`) |
| `UI_DEFAULT_LANG` | No | `ja` | Default UI language (`ja`/`en`) |
| `HOST` | No | `0.0.0.0` | Flask bind host |
| `PORT` | No | `5000` (dev) / `8000` (container) | Flask bind port |

\* At least one of DI_ENDPOINT or CU_ENDPOINT must be set.

---

## 26. API Endpoints Reference

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (`{"ok": true}`) |

### Document Intelligence

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/models` | List DI prebuilt models (30 models with categories) |
| `POST` | `/api/analyze` | Start DI analysis job. Body: `{documentId, modelId, options}` |

### Content Understanding

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/cu/models` | List CU prebuilt analyzers (47 analyzers with categories) |
| `POST` | `/api/cu/analyze` | Start CU analysis job. Body: `{documentId, analyzerId, options}` |

### Jobs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/jobs/<job_id>` | Get job status |
| `GET` | `/api/jobs/<job_id>/result` | Get job result (only when `succeeded`) |

### Documents

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/documents` | Upload a document (multipart `file` field) |
| `GET` | `/files/<document_id>` | Download/serve a document |

### Library & Cache

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/library` | List cached files with variants |
| `POST` | `/api/library/refresh` | Rescan upload directory |
| `DELETE` | `/api/library/<file_hash>` | Delete cache + documents for a hash |
| `GET` | `/api/library/<file_hash>/cache/<encoded_key>` | Get a specific cached result |
| `POST` | `/api/cache/exists` | Check cache existence. Body: `{fileHash, modelId, options}` |

### User Tabs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/usertabs?lang=<lang>` | List available user tabs |
| `GET` | `/api/usertabs/<name>?lang=<lang>` | Get user tab HTML content |

### Static & Pages

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Main SPA page |
| `GET` | `/static/*` | Static assets (JS, CSS) |
