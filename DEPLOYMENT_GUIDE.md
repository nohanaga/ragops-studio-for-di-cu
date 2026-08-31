# RAGOps Studio Deployment Guide

This guide describes how to deploy RAGOps Studio for Document Intelligence / Content Understanding to Azure Container Apps.

- 日本語版: [DEPLOYMENT_GUIDE.ja.md](DEPLOYMENT_GUIDE.ja.md)
- Project overview: [README.md](README.md)

## Choose a deployment method

| Method | Use when | Storage | Authentication |
|---|---|---|---|
| Azure Developer CLI (`azd`) | Provisioning a complete new environment (recommended) | Azure Blob Storage | User Assigned Managed Identity |
| Azure CLI scripts | Reusing existing DI / CU resources | Azure Files SMB or Blob Storage | API keys or Managed Identity |

## Deploy with Azure Developer CLI (recommended)

The repository includes an [Azure Developer CLI (`azd`)](https://learn.microsoft.com/azure/developer/azure-developer-cli/overview) template that provisions infrastructure, remotely builds the repository-root Dockerfile, and deploys the application to Azure Container Apps in one workflow.

### Prerequisites

- [Install Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd).
- Use a subscription where you can create the required Azure resources.
- The deploying identity must be able to create role assignments. `Owner`, or `User Access Administrator` together with resource creation permissions, satisfies this requirement.
- Choose a [Content Understanding supported region](https://learn.microsoft.com/azure/ai-services/content-understanding/language-region-support). `japaneast` is supported.

### Provision and deploy

```bash
azd auth login
azd up
```

On the first run, select an environment name, subscription, and location. A local Docker daemon isn't required. The `remoteBuild: true` setting in [azure.yaml](azure.yaml) builds the image in Azure Container Registry.

`azd up` provisions:

- Azure AI Document Intelligence
- Microsoft Foundry resource for Content Understanding
- Azure Container Registry
- Azure Container Apps environment and Container App
- Azure Storage account and private Blob container
- Log Analytics workspace
- User Assigned Managed Identity and required Azure RBAC assignments

Document Intelligence, Content Understanding, Blob Storage, and ACR access are keyless at runtime. [infra/resources.bicep](infra/resources.bicep) disables local authentication where supported and configures Managed Identity instead of placing API keys in Container Apps settings.

### Values configured in Container Apps

`azd up` automatically applies the following runtime settings. You don't need to duplicate them in the Azure portal.

| Setting | Value | Purpose |
|---|---|---|
| Ingress | External, HTTPS, target port `8000` | Exposes the web UI and API |
| Container port | `PORT=8000` | Gunicorn listening port |
| Identity | User Assigned Managed Identity | Keyless authentication to DI, CU, Blob Storage, and ACR |
| `AZURE_CLIENT_ID` | Client ID of the provisioned User Assigned Managed Identity | Selects the identity used by `DefaultAzureCredential` |
| `DI_ENDPOINT` | Endpoint of the provisioned Document Intelligence resource | DI API endpoint |
| `DI_AUTH_MODE` | `identity` | Uses Managed Identity for DI |
| `CU_ENDPOINT` | Root endpoint of the provisioned Microsoft Foundry resource | CU API endpoint |
| `CU_AUTH_MODE` | `identity` | Uses Managed Identity for CU |
| `STORAGE_BACKEND` | `blob` | Direct access through the Azure Blob Storage SDK |
| `AZURE_STORAGE_ACCOUNT_NAME` | Name of the provisioned storage account | Blob storage target |
| `AZURE_STORAGE_CONTAINER_NAME` | `appstorage` | Blob container name |
| `UPLOADS_ENABLED` | `true` | Enables file uploads |
| `USER_TABS_ENABLED` | `false` | Disables user tabs |

This configuration doesn't use an Azure Files volume. Don't add a volume at `/app/storage`; the application accesses the Blob container directly through the SDK.

### Verify the deployment

Get the deployed URL:

```bash
azd env get-value AZURE_CONTAINER_APP_URI
```

Verify the following:

1. The web UI opens at the deployed URL.
2. A file can be uploaded.
3. DI or CU analysis completes successfully.
4. Container App logs don't continue to report Blob Storage `403 AuthorizationFailure` errors.

Azure RBAC role assignments can take time to propagate. If a `403` occurs only immediately after deployment, verify the role assignment and restart the active revision after propagation. See [Assign an Azure role for access to blob data](https://learn.microsoft.com/azure/storage/blobs/assign-azure-role-data-access).

### Update

For application-only changes:

```bash
azd deploy
```

For application and infrastructure changes:

```bash
azd up
```

See [Azure Developer CLI Container Apps workflows](https://learn.microsoft.com/azure/developer/azure-developer-cli/container-apps-workflows) for deployment behavior.

> Content Understanding generative analyzers can additionally require supported Foundry model deployments and resource-level model defaults. These depend on regional availability and subscription quota, so this template doesn't create them. Follow the [Content Understanding model deployment guidance](https://learn.microsoft.com/azure/ai-services/content-understanding/concepts/models-deployments) when required.

## Deploy with Azure CLI scripts

Use [scripts/deploy_aca.ps1](scripts/deploy_aca.ps1) or [scripts/deploy_aca.sh](scripts/deploy_aca.sh) when reusing existing DI / CU resources.

### Prerequisites

- Azure CLI is installed.
- You have signed in with `az login`.
- At least one of the following already exists:
  - Azure AI Document Intelligence
  - Microsoft Foundry resource for Content Understanding

Example Document Intelligence resource creation:

```bash
az cognitiveservices account create \
    --name <your-di-resource-name> \
    --resource-group <your-resource-group> \
    --kind FormRecognizer \
    --sku S0 \
    --location japaneast

az cognitiveservices account show \
    --name <your-di-resource-name> \
    --resource-group <your-resource-group> \
    --query properties.endpoint -o tsv
```

For Content Understanding, use the root endpoint of the Microsoft Foundry resource. Specify the `Microsoft.CognitiveServices/accounts` resource name through `--cu-resource-name` / `-CuResourceName`.

### Storage modes

| Mode | PowerShell | Bash | Persistence | Storage authentication |
|---|---|---|---|---|
| SMB (default) | `-StorageMode smb` | `--storage-mode smb` | Azure Files mounted at `/app/storage` | Storage account key |
| Blob | `-StorageMode blob` | `--storage-mode blob` | Direct Azure Blob Storage SDK access | Managed Identity |

- SMB mode configures a storage account, file share, Container Apps environment storage registration, and volume mount.
- Blob mode configures a storage account with shared-key access disabled, Managed Identity, `Storage Blob Data Contributor`, and a Blob container.
- SMB mode isn't available when Azure Policy enforces `allowSharedKeyAccess=false`.

### Manually configure SMB in the Azure portal

SMB mode mounts a classic Azure Files share, not a Blob container, at `/app/storage`. Azure Files mounts in Container Apps use a storage account key. Use Blob mode when a keyless configuration is required.

> The storage account provisioned by `azd up` is configured for Blob access with `allowSharedKeyAccess=false`. Use a separate storage account that permits shared-key access for a manual SMB configuration.

1. Create an Azure Files share.

   | Field | Example value |
   |---|---|
   | Storage account | `stragopssmb<unique-suffix>` |
   | Account kind | `StorageV2` |
   | Shared-key access | Enabled |
   | File share | `appstorage` |
   | Protocol | SMB |
   | Quota | `10 GiB` or more |

2. In the target Container Apps environment, not the Container App, select **Settings** → **Volume mounts** → **Add**.

   | Field | Example value |
   |---|---|
   | Protocol | SMB |
   | Name | `ragops-smb` |
   | Storage account name | `stragopssmb<unique-suffix>` |
   | Storage account key | Key 1 or Key 2 from the target account |
   | File share | `appstorage` |
   | Access mode | Read/Write |

3. In the Container App, select **Application** → **Revisions and replicas** → **Create new revision** → **Volumes**.

   | Field | Example value |
   |---|---|
   | Volume type | Azure file volume |
   | Volume name | `ragops-storage` |
   | File share name | `ragops-smb` |
   | Mount options | Empty |

4. Configure **Volume mounts** in the `app` container.

   | Field | Example value |
   |---|---|
   | Volume name | `ragops-storage` |
   | Mount path | `/app/storage` |
   | Sub path | Empty |

5. Configure Container App environment variables.

   | Environment variable | Value | Notes |
   |---|---|---|
   | `STORAGE_BACKEND` | `local` | Uses `/app/storage` as a local filesystem |
   | `PORT` | `8000` | Gunicorn listening port |
   | `UPLOADS_ENABLED` | `true` | Enables file uploads |
   | `AZURE_STORAGE_ACCOUNT_NAME` | Remove | Blob mode only |
   | `AZURE_STORAGE_CONTAINER_NAME` | Remove | Blob mode only |

If you specify a sub path, use a path relative to the file-share root without a leading `/`. Create the new revision and verify that `/app/storage/uploads`, `/app/storage/results`, and `/app/storage/cache` are created in Azure Files.

A maximum replica count of `1` is recommended for this application's SMB configuration to avoid concurrent updates to the same files. See [Use storage mounts in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/storage-mounts#azure-files-volume).

### DI / CU authentication modes

| Mode | PowerShell | Bash | Description |
|---|---|---|---|
| Key (default) | `-DiAuthMode key` / `-CuAuthMode key` | `--di-auth-mode key` / `--cu-auth-mode key` | Stores API keys as Container Apps secrets |
| Identity | `-DiAuthMode identity` / `-CuAuthMode identity` | `--di-auth-mode identity` / `--cu-auth-mode identity` | Configures System Assigned Managed Identity and the `Cognitive Services User` role |

For Identity mode, also specify the corresponding `-DiResourceName` / `-CuResourceName` or `--di-resource-name` / `--cu-resource-name` option.

### Deployment examples

#### DI key authentication + SMB

PowerShell:

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"
$env:DI_KEY = "<your-di-key>"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio
```

Bash:

```bash
export DI_ENDPOINT="https://<your-di>.cognitiveservices.azure.com/"
export DI_KEY="<your-di-key>"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio
```

#### DI Managed Identity + Blob

PowerShell:

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -DiAuthMode identity `
    -DiResourceName <your-di-resource-name> `
    -StorageMode blob
```

Bash:

```bash
export DI_ENDPOINT="https://<your-di>.cognitiveservices.azure.com/"

./scripts/deploy_aca.sh \
    --location japaneast \
    --resource-group rg-ragops-studio \
    --di-auth-mode identity \
    --di-resource-name <your-di-resource-name> \
    --storage-mode blob
```

#### DI + CU, both Managed Identity + Blob

PowerShell:

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

Bash:

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

For CU-only deployment, set `CU_ENDPOINT` and only the required CU authentication options. DI / CU endpoints and keys can be passed through environment variables or the corresponding command-line options.

### Main options

| PowerShell | Bash | Default | Description |
|---|---|---|---|
| `-Location` | `--location` | `japaneast` | Azure region |
| `-ResourceGroupName` | `--resource-group` | `rg-ragops-studio` | Resource group name |
| `-AcrName` | `--acr-name` | `acrragopsstudio` | ACR name |
| `-StorageShareName` | `--storage-share` | `appstorage` | SMB file share name |
| `-StorageShareQuotaGiB` | `--storage-share-quota` | `10` | SMB file share quota |
| `-BlobContainerName` | `--blob-container` | `appstorage` | Blob container name |
| `-DiAuthMode` | `--di-auth-mode` | `key` | DI authentication mode |
| `-DiResourceName` | `--di-resource-name` | None | DI resource name for Identity mode |
| `-CuAuthMode` | `--cu-auth-mode` | `key` | CU authentication mode |
| `-CuResourceName` | `--cu-resource-name` | None | CU resource name for Identity mode |

See each script's help for all options.

### Update

Run the same script again to rebuild the image and update the Container App.

- Endpoints and keys usually don't need to be set again.
- To rotate keys, specify `-DiKey` / `-CuKey` or `--di-key` / `--cu-key`.
- To switch authentication mode, explicitly pass the new mode.

## Secure access with Entra ID (Easy Auth)

This application doesn't include user login. When exposing Azure Container Apps through External Ingress, enable [built-in authentication](https://learn.microsoft.com/azure/container-apps/authentication) to restrict access to users in your Microsoft Entra ID tenant.

| Scenario | Recommendation |
|---|---|
| Local or VPN-only | Network isolation can be sufficient |
| Internal Ingress | Recommended as defense in depth |
| External Ingress | Strongly recommended |
| Confidential documents | Strongly recommended |

Without authentication, third parties could invoke analysis APIs, consume API quota, delete data, and perform operations without an audit identity.

### Setup

1. Register an application in Microsoft Entra ID.

```bash
az ad app create --display-name "RAGOps Studio" \
    --web-redirect-uris "https://<your-container-app-fqdn>/.auth/login/aad/callback" \
    --sign-in-audience AzureADMyOrg
```

2. Enable Container App authentication with the returned `appId`.

```bash
az containerapp auth microsoft update \
    --name <container-app-name> \
    --resource-group <resource-group> \
    --client-id <app-client-id> \
    --issuer "https://login.microsoftonline.com/<tenant-id>/v2.0" \
    --yes
```

3. Open the application URL and verify that unauthenticated users are redirected to Microsoft Entra ID sign-in.

The authenticated user's identity is available in the `X-MS-CLIENT-PRINCIPAL-NAME` request header.

## Official documentation

- [Azure Developer CLI overview](https://learn.microsoft.com/azure/developer/azure-developer-cli/overview)
- [Azure Developer CLI Container Apps workflows](https://learn.microsoft.com/azure/developer/azure-developer-cli/container-apps-workflows)
- [Storage mounts in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/storage-mounts)
- [Managed identities in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/managed-identity)
- [Authentication and authorization in Azure Container Apps](https://learn.microsoft.com/azure/container-apps/authentication)
- [Content Understanding region support](https://learn.microsoft.com/azure/ai-services/content-understanding/language-region-support)
