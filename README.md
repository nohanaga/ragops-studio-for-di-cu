<p align="center">
  <img src="./static/icon.png" alt="RAGOps Studio for Document Intelligence / Content Understanding" width="240" height="240">
</p>

# RAGOps Studio for Document Intelligence / Content Understanding

![Azure DI](https://img.shields.io/badge/Azure-Document%20Intelligence-0078D4?style=flat-square&logo=microsoft-azure)
![Azure CU](https://img.shields.io/badge/Azure-Content%20Understanding-0078D4?style=flat-square&logo=microsoft-azure)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)
![PDF.js](https://img.shields.io/badge/PDF.js-v5-F7DF1E?style=flat-square)

A workbench for refining the **document parsing layer** at the heart of every RAG pipeline. Iterate through analyze → inspect → adjust → compare cycles using Azure AI **Document Intelligence (DI)** and **Content Understanding (CU)**, all from a lightweight single browser-based tool that runs locally or in a container (Flask backend).

> 📦 **RAGOps Studio Series**
> - [RAGOps Studio — for Azure AI Search](https://github.com/nohanaga/ragops-studio): A React/TypeScript workbench for observing, comparing, and improving search index quality (Series #1)
> - **RAGOps Studio — for DI/CU** (this repo): A workbench for refining the document parsing layer

- 日本語版: [README.ja.md](README.ja.md)

![image.png](./docs/images/001.jpg)

## Why RAGOps Studio?

RAG quality starts with document extraction. A wrong model choice, a missing option, or an unseen edge case in your documents silently degrades retrieval accuracy and answer quality downstream. Without a fast feedback loop, these issues go unnoticed until production.

RAGOps Studio provides that feedback loop — the **observe → compare → improve** entry point for RAGOps:

- **Analyze**: Switch DI / CU models and options with one click, run extraction, view Summary / Items / JSON
- **Inspect**: Overlay bounding boxes (BBox) on PDF/image previews to *see* exactly what was extracted and where
- **Iterate**: Change options and re-run instantly; CU derived analyzers are managed automatically
- **Compare**: Semantic Diff across multiple cached variants — evaluate impact before committing to your RAG pipeline

All results are cached (file SHA-256 + model + options SHA-1), so you can iterate repeatedly without extra API cost.

### Architecture overview

- Backend: Flask (API + job management + storage management)
- Frontend: plain HTML/CSS/JS (single screen, Studio-like 3-pane layout)
- Persistence: local filesystem or Azure Blob Storage

## Features

### Dual-service support
- **Document Intelligence (DI)** and **Content Understanding (CU)** evaluated side-by-side in a single UI
- One-click DI ↔ CU switching (service selector)
- DI: 30 built-in models + custom model ID manual input
- CU: 47 built-in analyzers (rich model picker with text filtering, category groups, US-only toggle)

### Analysis & iteration
- Studio-like workflow: pick a file → select a model → Analyze → view Summary / Items / JSON
- Job execution: background thread SDK calls → poll by job ID → render results
- DI analysis options: `ocrHighResolution` / `formulas` / `barcodes` / `styleFont` / `pages` / `locale` / `output_content_format` / `query_fields`, etc.
- CU analysis options: 16 of 18 Processing Configuration parameters supported (89% coverage)
- CU derived analyzer auto-management: when options change, automatically creates `studio.<source>.<hash>` derived analyzers

### Visual inspection
- **PDF viewer**: pdf.js v5 rendering + SVG bounding box (BBox) overlay (Lines / Words / Paragraphs / Tables / KVP / SelectionMarks / Figures / Formulas / Barcodes)
- **Media viewer**: audio/video file preview playback
- **3D Structure viewer**: 3D exploded view of document elements (🥚 Easter egg — a joke feature, not a practical tool)
- *See* results instead of reading JSON — spot chunk boundaries, field extraction errors, and OCR issues instantly

### Cache & Library (result accumulation and comparison)
- Result caching: caches by file (SHA-256) + model + options (SHA-1 signature) to reuse results → iterate without extra API cost
- Library view: lists cached files as cards, per-variant loading and deletion
- **Result comparison mode (Semantic Diff)**: compare “Model A vs B” or “Option X vs Y” at a structural level with highlighted differences — evaluate downstream RAG impact before committing

    ![image.png](./docs/images/002.png)

### User tabs (business scenario demo)
- Place HTML files in `usertab/<lang>/` to auto-add custom tabs to the result panel (multi-language support)
- **Demo-only feature**: displays static HTML mockups of AI agent execution results for various business scenarios. No actual agent invocation or dynamic processing is performed
- Bundled samples: Character Validation, FSA Risk Assessment, Legal Clause Check — all are mockups to showcase how agent output *would look* in a real workflow
- `window.__USERTAB_API__` provides access to extraction result data, making it useful for prototyping future agent integrations

### UX
- Full client-side Japanese / English switching (i18n) — user tabs language-synced
- 5 themes: Dark / Light / Midnight / Forest / Solarized
- Uploads enabled by default (disable via `UPLOADS_ENABLED=false`)

### Storage
- **Local mode** (`STORAGE_BACKEND=local`): saves to `storage/` directory (default)
- **Blob mode** (`STORAGE_BACKEND=blob`): saves directly to Azure Blob Storage (`DefaultAzureCredential` / Managed Identity auth)

### Authentication

DI and CU each have independent auth settings via `DI_AUTH_MODE` / `CU_AUTH_MODE`:

| Mode | Env value | Behavior |
|---|---|---|
| **Auto** (default) | `auto` | Uses API key if `DI_KEY`/`CU_KEY` is set, otherwise falls back to `DefaultAzureCredential` (Managed Identity / Entra ID) |
| **Key** | `key` | Always uses API key auth. Key must be set or an error is raised |
| **Identity** | `identity` | Always uses `DefaultAzureCredential`. No API key required |

- Blob storage (`STORAGE_BACKEND=blob`): always uses `DefaultAzureCredential` — keyless auth only, no storage account key involved

## Prerequisites

- Python 3.10+ recommended
- One or both of:
  - Azure AI Document Intelligence `endpoint` (+ `key` or Managed Identity)
  - Azure AI Content Understanding `endpoint` (+ `key` or Managed Identity)

## Setup

**macOS / Linux:**

```bash
cd <this-repo>
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

**Windows (PowerShell):**

```powershell
cd <this-repo>
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set environment variables for the services you use:

```bash
# Document Intelligence
DI_ENDPOINT=https://<your-di>.cognitiveservices.azure.com/
DI_KEY=<your-di-key>          # not needed for identity mode
# DI_AUTH_MODE=auto            # key / identity / auto (default: auto)

# Content Understanding (optional)
# CU_ENDPOINT=https://<your-cu>.cognitiveservices.azure.com/
# CU_KEY=<your-cu-key>
# CU_AUTH_MODE=auto

# Storage (default: local)
# STORAGE_BACKEND=local        # local / blob
# AZURE_STORAGE_ACCOUNT_NAME=  # required for blob mode
# AZURE_STORAGE_CONTAINER_NAME=appstorage

# UI
# UPLOADS_ENABLED=true         # set false to disable uploads
# UI_DEFAULT_LANG=ja           # ja / en
```

## Run

```bash
python app.py
```

Open `http://127.0.0.1:5000/`.

## RAGOps workflow example

1. **Establish a baseline**: Upload a document, analyze with DI `prebuilt-layout` → cache the result
2. **Explore options**: Re-analyze with `ocrHighResolution`, `formulas`, etc. → variants accumulate in the Library automatically
3. **Compare & evaluate**: Select multiple variants from the Library → Semantic Diff shows "which option works best for my documents"
4. **Cross-service comparison**: Analyze the same document with a CU analyzer → compare DI and CU results side by side
5. **Business scenario demo**: Place AI agent execution result samples in user tabs and display them alongside extraction results (static HTML mockups)
6. **Feed back to production**: Identify the optimal model + options combination, apply it to your RAG pipeline’s ingestion config

## Notes

- This tool is designed for the RAG development and validation phase. For always-on production workloads, consider a Queue/Worker architecture with proper auth/authz.
- PDF preview loads PDF.js from `static/vendor/pdfjs/` if present (local first), otherwise falls back to a CDN.
  - For offline/air-gapped environments, place PDF.js build artifacts (from `pdfjs-dist`) under `static/vendor/pdfjs/`.

## Deploy to Azure Container Apps

### Prerequisites

- Azure CLI installed
- Logged in via `az login`
- The following Azure resources must be **created beforehand** (the deploy script does not create them):
  - **Azure AI Document Intelligence** — provide endpoint URL via `--di-endpoint` / `-DiEndpoint`
  - **Azure AI Content Understanding** (AI Services created via Azure AI Foundry) — provide endpoint URL via `--cu-endpoint` / `-CuEndpoint`
  - At least one of the above is required

<details>
<summary>Example: create resources with Azure CLI</summary>

```bash
# Document Intelligence (FormRecognizer)
az cognitiveservices account create \
    --name <your-di-resource-name> \
    --resource-group <your-resource-group> \
    --kind FormRecognizer \
    --sku S0 \
    --location japaneast

# Check endpoint
az cognitiveservices account show \
    --name <your-di-resource-name> \
    --resource-group <your-resource-group> \
    --query properties.endpoint -o tsv
```

For Content Understanding, use the endpoint of the **AI Services account** associated with your Azure AI Foundry project.
For `--cu-resource-name` / `-CuResourceName`, specify the `Microsoft.CognitiveServices/accounts` resource name.

```bash
# List existing resources
az cognitiveservices account list -o table
```

</details>

### Storage modes

The deploy script supports 2 storage modes:

| Mode | PowerShell | Bash | Persistence method | Storage auth |
|---|---|---|---|---|
| **SMB** (default) | `-StorageMode smb` | `--storage-mode smb` | Azure Files volume mount (`/app/storage`) | Storage account key (SMB constraint) |
| **Blob** | `-StorageMode blob` | `--storage-mode blob` | Azure Blob Storage SDK direct R/W | Managed Identity (`DefaultAzureCredential`) |

- **SMB mode**: script auto-configures Storage Account / File Share creation → CAE storage registration → volume mount
- **Blob mode**: script auto-configures Storage Account creation (`allowSharedKeyAccess=false`) → system-assigned MI → `Storage Blob Data Contributor` role → Blob container creation

> ⚠️ If Azure Policy enforces `allowSharedKeyAccess=false`, SMB mode won't work. Use `-StorageMode blob` instead.

### DI auth modes

The deploy script auto-configures DI authentication:

| Mode | PowerShell | Bash | Description |
|---|---|---|---|
| **Key** (default) | `-DiAuthMode key` | `--di-auth-mode key` | API key stored as Container Apps secret |
| **Identity** | `-DiAuthMode identity` | `--di-auth-mode identity` | System-assigned MI enabled + auto-assigned `Cognitive Services User` role |

### CU auth modes

The deploy script also supports CU authentication with the same patterns:

| Mode | PowerShell | Bash | Description |
|---|---|---|---|
| **Key** (default) | `-CuAuthMode key` | `--cu-auth-mode key` | API key stored as Container Apps secret |
| **Identity** | `-CuAuthMode identity` | `--cu-auth-mode identity` | System-assigned MI enabled + auto-assigned `Cognitive Services User` role |

> 💡 At least one of DI or CU must be configured (endpoint provided). You can deploy with DI only, CU only, or both.

### Deploy (create on first run, update afterwards)

> 💡 DI / CU endpoints and keys can be passed via environment variables (`DI_ENDPOINT`, `DI_KEY`, `CU_ENDPOINT`, `CU_KEY`) or command-line arguments. The examples below use environment variables.
>
> Key script defaults: `-Location japaneast` / `-ResourceGroupName rg-ragops-studio` / `-AcrName acrragopsstudio`. Only specify these if you need different values.

#### Pattern 1: DI key auth + SMB storage (simplest)

**PowerShell (Windows):**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"
$env:DI_KEY = "<your-di-key>"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio
```

**Bash (macOS / Linux):**

```bash
export DI_ENDPOINT="https://<your-di>.cognitiveservices.azure.com/"
export DI_KEY="<your-di-key>"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio
```

#### Pattern 2: DI Managed Identity + Blob storage (keyless)

**PowerShell (Windows):**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -DiAuthMode identity `
    -DiResourceName <your-di-resource-name> `
    -StorageMode blob
```

**Bash (macOS / Linux):**

```bash
export DI_ENDPOINT="https://<your-di>.cognitiveservices.azure.com/"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio \
    --di-auth-mode identity \
    --di-resource-name <your-di-resource-name> \
    --storage-mode blob
```

#### Pattern 3: DI + CU (both key auth)

**PowerShell (Windows):**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"
$env:DI_KEY = "<your-di-key>"
$env:CU_ENDPOINT = "https://<your-cu>.cognitiveservices.azure.com/"
$env:CU_KEY = "<your-cu-key>"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio
```

**Bash (macOS / Linux):**

```bash
export DI_ENDPOINT="https://<your-di>.cognitiveservices.azure.com/"
export DI_KEY="<your-di-key>"
export CU_ENDPOINT="https://<your-cu>.cognitiveservices.azure.com/"
export CU_KEY="<your-cu-key>"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio
```

#### Pattern 4: DI + CU (both Managed Identity, keyless)

**PowerShell (Windows):**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"
$env:CU_ENDPOINT = "https://<your-cu>.cognitiveservices.azure.com/"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -DiAuthMode identity `
    -DiResourceName <your-di-resource-name> `
    -CuAuthMode identity `
    -CuResourceName <your-cu-resource-name> `
    -StorageMode blob
```

**Bash (macOS / Linux):**

```bash
export DI_ENDPOINT="https://<your-di>.cognitiveservices.azure.com/"
export CU_ENDPOINT="https://<your-cu>.cognitiveservices.azure.com/"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio \
    --di-auth-mode identity \
    --di-resource-name <your-di-resource-name> \
    --cu-auth-mode identity \
    --cu-resource-name <your-cu-resource-name> \
    --storage-mode blob
```

#### Pattern 5: CU only (key auth)

**PowerShell (Windows):**

```powershell
$env:CU_ENDPOINT = "https://<your-cu>.cognitiveservices.azure.com/"
$env:CU_KEY = "<your-cu-key>"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio
```

**Bash (macOS / Linux):**

```bash
export CU_ENDPOINT="https://<your-cu>.cognitiveservices.azure.com/"
export CU_KEY="<your-cu-key>"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio
```

#### Options

Only specify these when you need to override the defaults:

| PowerShell | Bash | Default | Description |
|---|---|---|---|
| `-Location` | `--location` | `japaneast` | Azure region |
| `-ResourceGroupName` | `--resource-group` | `rg-ragops-studio` | Resource group name |
| `-AcrName` | `--acr-name` | `acrragopsstudio` | ACR name |
| `-StorageShareName "name"` | `--storage-share name` | `appstorage` | File share name (SMB mode) |
| `-StorageShareQuotaGiB 20` | `--storage-share-quota 20` | `10` | File share size in GiB (SMB mode) |
| `-BlobContainerName "name"` | `--blob-container name` | `appstorage` | Blob container name (Blob mode) |
| `-DiAuthMode key\|identity` | `--di-auth-mode key\|identity` | `key` | DI authentication mode |
| `-DiResourceName "name"` | `--di-resource-name name` | — | DI resource name (RBAC scope for identity mode) |
| `-DiResourceGroupName "name"` | `--di-resource-group name` | same as `--resource-group` | DI resource group |
| `-CuAuthMode key\|identity` | `--cu-auth-mode key\|identity` | `key` | CU authentication mode |
| `-CuResourceName "name"` | `--cu-resource-name name` | — | CU resource name (RBAC scope for identity mode) |
| `-CuResourceGroupName "name"` | `--cu-resource-group name` | same as `--resource-group` | CU resource group |

### Update

Re-run the same command to rebuild/push the image and update the Container App.

- Usually you do NOT need to re-set endpoints/keys (secrets/env are kept).
- To rotate keys, pass `-DiKey` / `-CuKey` (bash: `--di-key` / `--cu-key`) to update secrets.
- To switch auth mode, pass the new `-DiAuthMode` / `-CuAuthMode` (bash: `--di-auth-mode` / `--cu-auth-mode`) value.

## Securing with Entra ID (Easy Auth)

This app does **not** include user login functionality. When deploying to Azure Container Apps with external ingress, consider enabling **Built-in Authentication (Easy Auth)** to restrict access to your Microsoft Entra ID tenant.

### When should you enable it?

| Scenario | Recommendation |
|---|---|
| Local only (`localhost`) or behind VPN | Not required — network isolation is sufficient |
| Azure Container Apps with **internal** ingress | Recommended (defense in depth) |
| Azure Container Apps with **external** ingress | **Strongly recommended** — all APIs are publicly reachable without auth |
| Handling confidential documents | **Strongly recommended** — uploaded files and analysis results could leak |

Key risks without authentication:
- Anyone on the internet can call `POST /api/analyze`, consuming your DI/CU quota and incurring costs
- `DELETE /api/library/<file_hash>` is unprotected — data can be deleted by unauthorized users
- No audit trail of who performed which operations

### Setup (no code changes required)

1. **Register an app in Microsoft Entra ID**

   ```bash
   az ad app create --display-name "RAGOps Studio" \
       --web-redirect-uris "https://<your-container-app-fqdn>/.auth/login/aad/callback" \
       --sign-in-audience AzureADMyOrg
   ```

   Note the `appId` (client ID) from the output.

2. **Enable authentication on the Container App**

   ```bash
   az containerapp auth microsoft update \
       --name <container-app-name> \
       --resource-group <resource-group> \
       --client-id <app-client-id> \
       --issuer "https://login.microsoftonline.com/<tenant-id>/v2.0" \
       --yes
   ```

3. **Verify**: accessing the app URL now redirects unauthenticated users to the Entra ID login page.

> 💡 The authenticated user's identity is available in the `X-MS-CLIENT-PRINCIPAL-NAME` request header, which can be used for future audit logging.
>
> For more details, see [Authentication and authorization in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/authentication).


## License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.


This is a personal project and is not an official Microsoft product. This project is community-driven and provided AS-IS without any warranties. The developers, including Microsoft, assume no responsibility for any issues arising from the use of this software, and no official support is provided.
