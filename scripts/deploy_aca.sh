#!/usr/bin/env bash
# ==============================================================================
# deploy_aca.sh — Deploy RAGOps Studio to Azure Container Apps (macOS / Linux)
#
# Bash equivalent of deploy_aca.ps1. Requires: az, jq, docker (or ACR build).
# ==============================================================================

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────
LOCATION="japaneast"
RESOURCE_GROUP_NAME="rg-ragops-studio"
ACR_NAME="acrragopsstudio"
CONTAINER_APPS_ENV_NAME="cae-ragops-studio"
CONTAINER_APP_NAME="ca-ragops-studio"
IMAGE_REPO="ragops-studio"
IMAGE_TAG=""
IDENTITY_NAME="id-ragops-studio"
LOG_ANALYTICS_WORKSPACE_NAME="law-ragops-studio"
UPLOADS_ENABLED="true"

# Storage
STORAGE_ACCOUNT_NAME=""
STORAGE_SHARE_NAME="appstorage"
ENVIRONMENT_STORAGE_NAME="appstorage"
STORAGE_SHARE_QUOTA_GIB=10
STORAGE_MODE="smb"
BLOB_CONTAINER_NAME="appstorage"

# DI
DI_ENDPOINT_PARAM=""
DI_KEY_PARAM=""
DI_AUTH_MODE="key"
DI_RESOURCE_NAME=""
DI_RESOURCE_GROUP_NAME=""

# CU
CU_ENDPOINT_PARAM=""
CU_KEY_PARAM=""
CU_AUTH_MODE="key"
CU_RESOURCE_NAME=""
CU_RESOURCE_GROUP_NAME=""

SUBSCRIPTION_ID=""

# ── Color helpers ─────────────────────────────────────────────
_cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
_red()    { printf '\033[31m%s\033[0m\n' "$*"; }

# ── Usage ─────────────────────────────────────────────────────
usage() {
    cat <<'EOF'
Usage: ./scripts/deploy_aca.sh [OPTIONS]

Required (at least one service):
  --di-endpoint URL           Document Intelligence endpoint (or set DI_ENDPOINT env var)
  --di-key KEY                DI API key (or set DI_KEY env var; not needed for identity mode)
  --cu-endpoint URL           Content Understanding endpoint (or set CU_ENDPOINT env var)
  --cu-key KEY                CU API key (or set CU_KEY env var; not needed for identity mode)

Azure resources:
  --subscription ID           Azure subscription ID
  --location LOCATION         Azure region (default: japaneast)
  --resource-group NAME       Resource group name (default: rg-ragops-studio)
  --acr-name NAME             Azure Container Registry name (default: acrragopsstudio)
  --container-app-name NAME   Container App name (default: ca-ragops-studio)
  --container-env-name NAME   Container Apps Environment name (default: cae-ragops-studio)
  --identity-name NAME        Managed identity name (default: id-ragops-studio)
  --log-analytics-name NAME   Log Analytics workspace name (default: law-ragops-studio)
  --image-repo NAME           Image repo name (default: ragops-studio)
  --image-tag TAG             Image tag (default: git short SHA or timestamp)

Storage:
  --storage-mode smb|blob     Storage mode (default: smb)
  --storage-account NAME      Storage account name (auto-generated if omitted)
  --storage-share NAME        File share name for SMB (default: appstorage)
  --storage-share-quota GIB   File share quota in GiB for SMB (default: 10)
  --blob-container NAME       Blob container name for blob mode (default: appstorage)

Authentication:
  --di-auth-mode key|identity DI authentication mode (default: key)
  --di-resource-name NAME     DI resource name (for identity RBAC scope)
  --di-resource-group NAME    DI resource group (defaults to --resource-group)
  --cu-auth-mode key|identity CU authentication mode (default: key)
  --cu-resource-name NAME     CU resource name (for identity RBAC scope)
  --cu-resource-group NAME    CU resource group (defaults to --resource-group)

App settings:
  --uploads-enabled true|false Enable file uploads (default: true)

  -h, --help                  Show this help
EOF
    exit 0
}

# ── Argument parsing ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --subscription)         SUBSCRIPTION_ID="$2"; shift 2 ;;
        --location)             LOCATION="$2"; shift 2 ;;
        --resource-group)       RESOURCE_GROUP_NAME="$2"; shift 2 ;;
        --acr-name)             ACR_NAME="$2"; shift 2 ;;
        --container-app-name)   CONTAINER_APP_NAME="$2"; shift 2 ;;
        --container-env-name)   CONTAINER_APPS_ENV_NAME="$2"; shift 2 ;;
        --identity-name)        IDENTITY_NAME="$2"; shift 2 ;;
        --log-analytics-name)   LOG_ANALYTICS_WORKSPACE_NAME="$2"; shift 2 ;;
        --image-repo)           IMAGE_REPO="$2"; shift 2 ;;
        --image-tag)            IMAGE_TAG="$2"; shift 2 ;;
        --uploads-enabled)      UPLOADS_ENABLED="$2"; shift 2 ;;
        --storage-mode)         STORAGE_MODE="$2"; shift 2 ;;
        --storage-account)      STORAGE_ACCOUNT_NAME="$2"; shift 2 ;;
        --storage-share)        STORAGE_SHARE_NAME="$2"; shift 2 ;;
        --storage-share-quota)  STORAGE_SHARE_QUOTA_GIB="$2"; shift 2 ;;
        --blob-container)       BLOB_CONTAINER_NAME="$2"; shift 2 ;;
        --di-endpoint)          DI_ENDPOINT_PARAM="$2"; shift 2 ;;
        --di-key)               DI_KEY_PARAM="$2"; shift 2 ;;
        --di-auth-mode)         DI_AUTH_MODE="$2"; shift 2 ;;
        --di-resource-name)     DI_RESOURCE_NAME="$2"; shift 2 ;;
        --di-resource-group)    DI_RESOURCE_GROUP_NAME="$2"; shift 2 ;;
        --cu-endpoint)          CU_ENDPOINT_PARAM="$2"; shift 2 ;;
        --cu-key)               CU_KEY_PARAM="$2"; shift 2 ;;
        --cu-auth-mode)         CU_AUTH_MODE="$2"; shift 2 ;;
        --cu-resource-name)     CU_RESOURCE_NAME="$2"; shift 2 ;;
        --cu-resource-group)    CU_RESOURCE_GROUP_NAME="$2"; shift 2 ;;
        -h|--help)              usage ;;
        *) _red "Unknown option: $1"; usage ;;
    esac
done

# ── Validate storage mode ────────────────────────────────────
if [[ "$STORAGE_MODE" != "smb" && "$STORAGE_MODE" != "blob" ]]; then
    _red "Invalid --storage-mode: $STORAGE_MODE (must be smb or blob)"; exit 1
fi
if [[ "$DI_AUTH_MODE" != "key" && "$DI_AUTH_MODE" != "identity" ]]; then
    _red "Invalid --di-auth-mode: $DI_AUTH_MODE (must be key or identity)"; exit 1
fi
if [[ "$CU_AUTH_MODE" != "key" && "$CU_AUTH_MODE" != "identity" ]]; then
    _red "Invalid --cu-auth-mode: $CU_AUTH_MODE (must be key or identity)"; exit 1
fi

# ── Helper functions ──────────────────────────────────────────

assert_az_cli() {
    if ! command -v az &>/dev/null; then
        _red "Azure CLI (az) was not found. Please install Azure CLI first."
        exit 1
    fi
    if ! command -v jq &>/dev/null; then
        _red "jq was not found. Please install jq first (brew install jq)."
        exit 1
    fi
}

invoke_az() {
    local output
    if ! output=$(az "$@" 2>&1); then
        _red "az $*"
        _red "$output"
        exit 1
    fi
    echo "$output"
}

invoke_az_quiet() {
    # Run az, suppress output, fail on error
    if ! az "$@" &>/dev/null; then
        return 1
    fi
    return 0
}

az_resource_exists() {
    # Returns 0 if resource exists
    az "$@" &>/dev/null 2>&1
}

get_default_image_tag() {
    if [[ -n "$IMAGE_TAG" ]]; then echo "$IMAGE_TAG"; return; fi
    if command -v git &>/dev/null; then
        local tag
        tag=$(git rev-parse --short HEAD 2>/dev/null || true)
        if [[ -n "$tag" ]]; then echo "$tag"; return; fi
    fi
    date +"%Y%m%d-%H%M%S"
}

sha256hex() {
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
}

get_default_storage_account_name() {
    local rg="$1" app="$2"
    local clean suffix
    clean=$(echo "$app" | tr -cd 'a-zA-Z0-9' | tr '[:upper:]' '[:lower:]')
    [[ -z "$clean" ]] && clean="app"
    clean="${clean:0:14}"
    suffix=$(sha256hex "${rg}|${app}" | cut -c1-8)
    echo "st${clean}${suffix}"
}

validate_storage_config() {
    local sa="$1" share="$2"
    if [[ ! "$sa" =~ ^[a-z0-9]{3,24}$ ]]; then
        _red "Invalid storage account name: $sa. Must be 3-24 characters, lowercase letters and numbers only."
        exit 1
    fi
    if [[ ! "$share" =~ ^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$ ]]; then
        _red "Invalid file share name: $share. Must be 3-63 characters, lowercase letters, numbers, and hyphens."
        exit 1
    fi
    _green "[OK] Storage configuration validated"
}

get_service_settings() {
    # $1=ServiceName, $2=Endpoint, $3=Key, $4=AuthMode, $5=EndpointEnvVar, $6=KeyEnvVar
    local svc="$1" ep="$2" key="$3" auth="$4" ep_env="$5" key_env="$6"
    if [[ -z "$ep" ]]; then ep="${!ep_env:-}"; fi
    if [[ -z "$ep" ]]; then
        _red "Missing $ep_env. Provide --$(echo "$svc" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')-endpoint or set env var $ep_env."
        exit 1
    fi
    if [[ "$auth" == "key" ]]; then
        if [[ -z "$key" ]]; then key="${!key_env:-}"; fi
        if [[ -z "$key" ]]; then
            _red "Missing $key_env. Provide the key or set env var $key_env (required for key auth mode)."
            exit 1
        fi
    fi
    # Return as KEY=VALUE lines
    echo "ENDPOINT=$ep"
    echo "KEY=$key"
    echo "AUTH_MODE=$auth"
}

parse_settings() {
    # Parse output of get_service_settings into variables
    local prefix="$1"
    shift
    local line
    while IFS= read -r line; do
        local k="${line%%=*}"
        local v="${line#*=}"
        eval "${prefix}_${k}=\"\$v\""
    done <<< "$@"
}

# ── Main ──────────────────────────────────────────────────────

assert_az_cli

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -n "$SUBSCRIPTION_ID" ]]; then
    invoke_az account set --subscription "$SUBSCRIPTION_ID" > /dev/null
fi

az extension add --name containerapp --upgrade --yes 2>/dev/null || true

IMAGE_TAG=$(get_default_image_tag)
UPLOADS_ENV_VALUE="$UPLOADS_ENABLED"

# Resolve resource groups
[[ -z "$DI_RESOURCE_GROUP_NAME" ]] && DI_RESOURCE_GROUP_NAME="$RESOURCE_GROUP_NAME"
[[ -z "$CU_RESOURCE_GROUP_NAME" ]] && CU_RESOURCE_GROUP_NAME="$RESOURCE_GROUP_NAME"

# Detect which services are configured
DI_CONFIGURED=false
CU_CONFIGURED=false
[[ -n "$DI_ENDPOINT_PARAM" || -n "${DI_ENDPOINT:-}" ]] && DI_CONFIGURED=true
[[ -n "$CU_ENDPOINT_PARAM" || -n "${CU_ENDPOINT:-}" ]] && CU_CONFIGURED=true

_cyan "[INFO] Services:"
if $DI_CONFIGURED; then
    _cyan "  - Document Intelligence: enabled (auth=$DI_AUTH_MODE)"
else
    _yellow "  - Document Intelligence: not configured"
fi
if $CU_CONFIGURED; then
    _cyan "  - Content Understanding: enabled (auth=$CU_AUTH_MODE)"
else
    _yellow "  - Content Understanding: not configured"
fi

# ── Storage Configuration ─────────────────────────────────────
if [[ -z "$STORAGE_ACCOUNT_NAME" ]]; then
    STORAGE_ACCOUNT_NAME=$(get_default_storage_account_name "$RESOURCE_GROUP_NAME" "$CONTAINER_APP_NAME")
fi
STORAGE_SHARE_NAME=$(echo "$STORAGE_SHARE_NAME" | tr '[:upper:]' '[:lower:]')

validate_storage_config "$STORAGE_ACCOUNT_NAME" "$STORAGE_SHARE_NAME"

STORAGE_MOUNT_PATH="/app/storage"
STORAGE_VOLUME_NAME="app-storage"

_cyan "[INFO] Storage configuration:"
_cyan "  - Storage Account: $STORAGE_ACCOUNT_NAME"
_cyan "  - File Share: $STORAGE_SHARE_NAME"
_cyan "  - Environment Storage Name: $ENVIRONMENT_STORAGE_NAME"
_cyan "  - Storage Mode: $STORAGE_MODE"
if [[ "$STORAGE_MODE" == "blob" ]]; then
    _cyan "  - Blob Container: $BLOB_CONTAINER_NAME"
fi

# ── Resource Group ────────────────────────────────────────────
RG_EXISTS=$(az group exists --name "$RESOURCE_GROUP_NAME" 2>/dev/null || echo "false")
if [[ "$RG_EXISTS" != "true" ]]; then
    echo "[+] Create resource group: $RESOURCE_GROUP_NAME ($LOCATION)"
    invoke_az group create --name "$RESOURCE_GROUP_NAME" --location "$LOCATION" -o none
else
    echo "[=] Resource group exists: $RESOURCE_GROUP_NAME"
fi

# ── ACR ───────────────────────────────────────────────────────
if ! az_resource_exists acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP_NAME" --only-show-errors; then
    echo "[+] Create ACR: $ACR_NAME"
    invoke_az acr create \
        --name "$ACR_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --location "$LOCATION" \
        --sku Basic \
        --admin-enabled false \
        -o none
else
    echo "[=] ACR exists: $ACR_NAME"
fi

# Enable ARM audience tokens for managed-identity image pull
AUTH_ARM_STATUS=$(az acr config authentication-as-arm show -r "$ACR_NAME" --query status -o tsv 2>/dev/null || echo "")
if [[ -n "$AUTH_ARM_STATUS" && "$AUTH_ARM_STATUS" != "enabled" ]]; then
    echo "[+] Enable ACR authentication-as-arm"
    az acr config authentication-as-arm update -r "$ACR_NAME" --status enabled -o none 2>/dev/null || true
fi

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP_NAME" --query loginServer -o tsv)
ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP_NAME" --query id -o tsv)

# ── User-assigned managed identity for ACR pull ───────────────
if ! az_resource_exists identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP_NAME" --only-show-errors; then
    echo "[+] Create managed identity: $IDENTITY_NAME"
    invoke_az identity create --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP_NAME" --location "$LOCATION" -o none
else
    echo "[=] Managed identity exists: $IDENTITY_NAME"
fi

IDENTITY_ID=$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP_NAME" --query id -o tsv)
PRINCIPAL_ID=$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP_NAME" --query principalId -o tsv)

# AcrPull role assignment (idempotent)
EXISTING_ACR_ROLES=$(az role assignment list \
    --assignee-object-id "$PRINCIPAL_ID" \
    --scope "$ACR_ID" \
    --query "[?roleDefinitionName=='AcrPull']" \
    -o json --only-show-errors 2>/dev/null || echo "[]")
ACR_ROLE_COUNT=$(echo "$EXISTING_ACR_ROLES" | jq 'length')
if [[ "$ACR_ROLE_COUNT" -eq 0 ]]; then
    echo "[+] Assign AcrPull role to identity"
    az role assignment create \
        --assignee-object-id "$PRINCIPAL_ID" \
        --assignee-principal-type ServicePrincipal \
        --role AcrPull \
        --scope "$ACR_ID" -o none 2>/dev/null || true
else
    echo "[=] AcrPull role already assigned"
fi

# ── Log Analytics ─────────────────────────────────────────────
if ! az_resource_exists monitor log-analytics workspace show --resource-group "$RESOURCE_GROUP_NAME" --workspace-name "$LOG_ANALYTICS_WORKSPACE_NAME" --only-show-errors; then
    echo "[+] Create Log Analytics workspace: $LOG_ANALYTICS_WORKSPACE_NAME"
    invoke_az monitor log-analytics workspace create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --workspace-name "$LOG_ANALYTICS_WORKSPACE_NAME" \
        --location "$LOCATION" -o none
else
    echo "[=] Log Analytics workspace exists: $LOG_ANALYTICS_WORKSPACE_NAME"
fi

LAW_CUSTOMER_ID=$(az monitor log-analytics workspace show \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --workspace-name "$LOG_ANALYTICS_WORKSPACE_NAME" \
    --query customerId -o tsv)
LAW_SHARED_KEY=$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --workspace-name "$LOG_ANALYTICS_WORKSPACE_NAME" \
    --query primarySharedKey -o tsv)

# ── Container Apps Environment ────────────────────────────────
if ! az_resource_exists containerapp env show --name "$CONTAINER_APPS_ENV_NAME" --resource-group "$RESOURCE_GROUP_NAME" --only-show-errors; then
    echo "[+] Create Container Apps environment: $CONTAINER_APPS_ENV_NAME"
    invoke_az containerapp env create \
        --name "$CONTAINER_APPS_ENV_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --location "$LOCATION" \
        --logs-workspace-id "$LAW_CUSTOMER_ID" \
        --logs-workspace-key "$LAW_SHARED_KEY" -o none
else
    echo "[=] Container Apps environment exists: $CONTAINER_APPS_ENV_NAME"
fi

# ── Build & push to ACR ──────────────────────────────────────
IMAGE_REF="${IMAGE_REPO}:${IMAGE_TAG}"
echo "[+] Build image in ACR: $IMAGE_REF"
invoke_az acr build \
    --registry "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --image "$IMAGE_REF" \
    .

FULL_IMAGE="${ACR_LOGIN_SERVER}/${IMAGE_REF}"

# ── Container App create / update ─────────────────────────────
APP_EXISTS=false
az_resource_exists containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP_NAME" --only-show-errors && APP_EXISTS=true

if [[ "$APP_EXISTS" == "false" ]]; then
    echo "[+] Create Container App: $CONTAINER_APP_NAME"

    if ! $DI_CONFIGURED && ! $CU_CONFIGURED; then
        _red "At least one service must be configured. Provide DI_ENDPOINT (--di-endpoint) and/or CU_ENDPOINT (--cu-endpoint)."
        exit 1
    fi

    # Resolve service settings
    DI_S_ENDPOINT="" ; DI_S_KEY="" ; DI_S_AUTH_MODE=""
    CU_S_ENDPOINT="" ; CU_S_KEY="" ; CU_S_AUTH_MODE=""
    if $DI_CONFIGURED; then
        parse_settings DI_S "$(get_service_settings "Document Intelligence" "$DI_ENDPOINT_PARAM" "$DI_KEY_PARAM" "$DI_AUTH_MODE" "DI_ENDPOINT" "DI_KEY")"
    fi
    if $CU_CONFIGURED; then
        parse_settings CU_S "$(get_service_settings "Content Understanding" "$CU_ENDPOINT_PARAM" "$CU_KEY_PARAM" "$CU_AUTH_MODE" "CU_ENDPOINT" "CU_KEY")"
    fi

    # Build secrets list
    SECRETS_ARGS=()
    if $DI_CONFIGURED && [[ "$DI_AUTH_MODE" == "key" ]]; then
        SECRETS_ARGS+=("di-endpoint=${DI_S_ENDPOINT}" "di-key=${DI_S_KEY}")
    fi
    if $CU_CONFIGURED && [[ "$CU_AUTH_MODE" == "key" ]]; then
        SECRETS_ARGS+=("cu-endpoint=${CU_S_ENDPOINT}" "cu-key=${CU_S_KEY}")
    fi

    # Build env vars list
    ENV_VARS=("UPLOADS_ENABLED=${UPLOADS_ENV_VALUE}")
    if $DI_CONFIGURED; then
        if [[ "$DI_AUTH_MODE" == "identity" ]]; then
            ENV_VARS+=("DI_ENDPOINT=${DI_S_ENDPOINT}" "DI_AUTH_MODE=identity")
        else
            ENV_VARS+=("DI_ENDPOINT=secretref:di-endpoint" "DI_KEY=secretref:di-key" "DI_AUTH_MODE=key")
        fi
    fi
    if $CU_CONFIGURED; then
        if [[ "$CU_AUTH_MODE" == "identity" ]]; then
            ENV_VARS+=("CU_ENDPOINT=${CU_S_ENDPOINT}" "CU_AUTH_MODE=identity")
        else
            ENV_VARS+=("CU_ENDPOINT=secretref:cu-endpoint" "CU_KEY=secretref:cu-key" "CU_AUTH_MODE=key")
        fi
    fi
    if [[ "$STORAGE_MODE" == "blob" ]]; then
        ENV_VARS+=("STORAGE_BACKEND=blob" "AZURE_STORAGE_ACCOUNT_NAME=${STORAGE_ACCOUNT_NAME}" "AZURE_STORAGE_CONTAINER_NAME=${BLOB_CONTAINER_NAME}")
    fi

    CREATE_ARGS=(
        containerapp create
        --name "$CONTAINER_APP_NAME"
        --resource-group "$RESOURCE_GROUP_NAME"
        --environment "$CONTAINER_APPS_ENV_NAME"
        --image "$FULL_IMAGE"
        --ingress external
        --target-port 8000
        --user-assigned "$IDENTITY_ID"
        --registry-identity "$IDENTITY_ID"
        --registry-server "$ACR_LOGIN_SERVER"
    )
    if [[ ${#SECRETS_ARGS[@]} -gt 0 ]]; then
        CREATE_ARGS+=(--secrets "${SECRETS_ARGS[@]}")
    fi
    CREATE_ARGS+=(--env-vars "${ENV_VARS[@]}")

    invoke_az "${CREATE_ARGS[@]}" -o none

else
    echo "[=] Container App exists: $CONTAINER_APP_NAME (update)"

    # Ensure user-assigned identity
    az containerapp identity assign \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --user-assigned "$IDENTITY_ID" -o none 2>/dev/null || true

    # Ensure registry uses managed identity
    az containerapp registry set \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --server "$ACR_LOGIN_SERVER" \
        --identity "$IDENTITY_ID" -o none 2>/dev/null || true

    # ── DI settings ───────────────────────────────────────────
    DI_S_ENDPOINT="" ; DI_S_KEY="" ; DI_S_AUTH_MODE=""
    ANY_DI_INPUT=false
    if [[ "$DI_AUTH_MODE" == "identity" ]]; then
        [[ -n "$DI_ENDPOINT_PARAM" || -n "${DI_ENDPOINT:-}" ]] && ANY_DI_INPUT=true
    else
        [[ -n "$DI_ENDPOINT_PARAM" || -n "$DI_KEY_PARAM" || -n "${DI_ENDPOINT:-}" || -n "${DI_KEY:-}" ]] && ANY_DI_INPUT=true
    fi
    if $ANY_DI_INPUT; then
        parse_settings DI_S "$(get_service_settings "Document Intelligence" "$DI_ENDPOINT_PARAM" "$DI_KEY_PARAM" "$DI_AUTH_MODE" "DI_ENDPOINT" "DI_KEY")"
        if [[ "$DI_AUTH_MODE" == "identity" ]]; then
            for s in di-key di-endpoint; do
                az containerapp secret remove --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP_NAME" --secret-names "$s" -o none 2>/dev/null || true
            done
        else
            invoke_az containerapp secret set \
                --name "$CONTAINER_APP_NAME" \
                --resource-group "$RESOURCE_GROUP_NAME" \
                --secrets "di-endpoint=${DI_S_ENDPOINT}" "di-key=${DI_S_KEY}" -o none
        fi
    else
        _yellow "[=] DI settings not provided; keeping existing DI secrets/env"
    fi

    # ── CU settings ───────────────────────────────────────────
    CU_S_ENDPOINT="" ; CU_S_KEY="" ; CU_S_AUTH_MODE=""
    ANY_CU_INPUT=false
    if [[ "$CU_AUTH_MODE" == "identity" ]]; then
        [[ -n "$CU_ENDPOINT_PARAM" || -n "${CU_ENDPOINT:-}" ]] && ANY_CU_INPUT=true
    else
        [[ -n "$CU_ENDPOINT_PARAM" || -n "$CU_KEY_PARAM" || -n "${CU_ENDPOINT:-}" || -n "${CU_KEY:-}" ]] && ANY_CU_INPUT=true
    fi
    if $ANY_CU_INPUT; then
        parse_settings CU_S "$(get_service_settings "Content Understanding" "$CU_ENDPOINT_PARAM" "$CU_KEY_PARAM" "$CU_AUTH_MODE" "CU_ENDPOINT" "CU_KEY")"
        if [[ "$CU_AUTH_MODE" == "identity" ]]; then
            for s in cu-key cu-endpoint; do
                az containerapp secret remove --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP_NAME" --secret-names "$s" -o none 2>/dev/null || true
            done
        else
            invoke_az containerapp secret set \
                --name "$CONTAINER_APP_NAME" \
                --resource-group "$RESOURCE_GROUP_NAME" \
                --secrets "cu-endpoint=${CU_S_ENDPOINT}" "cu-key=${CU_S_KEY}" -o none
        fi
    else
        _yellow "[=] CU settings not provided; keeping existing CU secrets/env"
    fi

    # ── Build env vars ────────────────────────────────────────
    SET_ENV_VARS=("UPLOADS_ENABLED=${UPLOADS_ENV_VALUE}")
    if $ANY_DI_INPUT; then
        SET_ENV_VARS+=("DI_AUTH_MODE=${DI_AUTH_MODE}")
        if [[ "$DI_AUTH_MODE" == "identity" ]]; then
            SET_ENV_VARS+=("DI_ENDPOINT=${DI_S_ENDPOINT}")
        else
            SET_ENV_VARS+=("DI_ENDPOINT=secretref:di-endpoint" "DI_KEY=secretref:di-key")
        fi
    fi
    if $ANY_CU_INPUT; then
        SET_ENV_VARS+=("CU_AUTH_MODE=${CU_AUTH_MODE}")
        if [[ "$CU_AUTH_MODE" == "identity" ]]; then
            SET_ENV_VARS+=("CU_ENDPOINT=${CU_S_ENDPOINT}")
        else
            SET_ENV_VARS+=("CU_ENDPOINT=secretref:cu-endpoint" "CU_KEY=secretref:cu-key")
        fi
    fi
    if [[ "$STORAGE_MODE" == "blob" ]]; then
        SET_ENV_VARS+=("STORAGE_BACKEND=blob" "AZURE_STORAGE_ACCOUNT_NAME=${STORAGE_ACCOUNT_NAME}" "AZURE_STORAGE_CONTAINER_NAME=${BLOB_CONTAINER_NAME}")
    fi

    invoke_az containerapp update \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --image "$FULL_IMAGE" \
        --set-env-vars "${SET_ENV_VARS[@]}" -o none
fi

# ========================================================================
# SYSTEM-ASSIGNED MANAGED IDENTITY & RBAC
# ========================================================================
NEEDS_SYSTEM_IDENTITY=false
if [[ "$DI_AUTH_MODE" == "identity" ]] && $DI_CONFIGURED; then NEEDS_SYSTEM_IDENTITY=true; fi
if [[ "$CU_AUTH_MODE" == "identity" ]] && $CU_CONFIGURED; then NEEDS_SYSTEM_IDENTITY=true; fi
if [[ "$STORAGE_MODE" == "blob" ]]; then NEEDS_SYSTEM_IDENTITY=true; fi

SYSTEM_PRINCIPAL_ID=""
if $NEEDS_SYSTEM_IDENTITY; then
    echo "[+] Enable system-assigned managed identity on Container App"
    invoke_az containerapp identity assign \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --system-assigned -o none

    SYSTEM_PRINCIPAL_ID=$(az containerapp show \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --query identity.principalId -o tsv)

    if [[ -z "$SYSTEM_PRINCIPAL_ID" ]]; then
        _red "Failed to retrieve system-assigned managed identity principalId"
        exit 1
    fi
    _cyan "[INFO] System-assigned identity principalId: $SYSTEM_PRINCIPAL_ID"
fi

# ── Assign Cognitive Services User role for DI identity mode ──
if [[ "$DI_AUTH_MODE" == "identity" ]] && $DI_CONFIGURED; then
    echo "[+] Configure RBAC for identity-based Document Intelligence access"
    COG_SVC_ROLE="Cognitive Services User"

    if [[ -n "$DI_RESOURCE_NAME" ]]; then
        DI_RESOURCE_ID=$(az cognitiveservices account show \
            --name "$DI_RESOURCE_NAME" \
            --resource-group "$DI_RESOURCE_GROUP_NAME" \
            --query id -o tsv)
        DI_RBAC_SCOPE="$DI_RESOURCE_ID"
        _cyan "[INFO] DI RBAC scope: resource '$DI_RESOURCE_NAME'"
    else
        DI_RBAC_SCOPE=$(az group show --name "$DI_RESOURCE_GROUP_NAME" --query id -o tsv)
        _yellow "[INFO] DI RBAC scope: resource group '$DI_RESOURCE_GROUP_NAME' (specify --di-resource-name for narrower scope)"
    fi

    EXISTING_DI_ROLES=$(az role assignment list \
        --assignee-object-id "$SYSTEM_PRINCIPAL_ID" \
        --scope "$DI_RBAC_SCOPE" \
        --query "[?roleDefinitionName=='$COG_SVC_ROLE']" \
        -o json --only-show-errors 2>/dev/null || echo "[]")
    DI_ROLE_COUNT=$(echo "$EXISTING_DI_ROLES" | jq 'length')
    if [[ "$DI_ROLE_COUNT" -eq 0 ]]; then
        echo "[+] Assign '$COG_SVC_ROLE' role for DI to system-assigned managed identity"
        az role assignment create \
            --assignee-object-id "$SYSTEM_PRINCIPAL_ID" \
            --assignee-principal-type ServicePrincipal \
            --role "$COG_SVC_ROLE" \
            --scope "$DI_RBAC_SCOPE" -o none 2>/dev/null || {
            _yellow "[WARN] Failed to assign '$COG_SVC_ROLE' role for DI. You may need to assign it manually."
        }
    else
        echo "[=] '$COG_SVC_ROLE' role already assigned for DI"
    fi
fi

# ── Assign Cognitive Services User role for CU identity mode ──
if [[ "$CU_AUTH_MODE" == "identity" ]] && $CU_CONFIGURED; then
    echo "[+] Configure RBAC for identity-based Content Understanding access"
    COG_SVC_ROLE="Cognitive Services User"

    if [[ -n "$CU_RESOURCE_NAME" ]]; then
        CU_RESOURCE_ID=$(az cognitiveservices account show \
            --name "$CU_RESOURCE_NAME" \
            --resource-group "$CU_RESOURCE_GROUP_NAME" \
            --query id -o tsv)
        CU_RBAC_SCOPE="$CU_RESOURCE_ID"
        _cyan "[INFO] CU RBAC scope: resource '$CU_RESOURCE_NAME'"
    else
        CU_RBAC_SCOPE=$(az group show --name "$CU_RESOURCE_GROUP_NAME" --query id -o tsv)
        _yellow "[INFO] CU RBAC scope: resource group '$CU_RESOURCE_GROUP_NAME' (specify --cu-resource-name for narrower scope)"
    fi

    EXISTING_CU_ROLES=$(az role assignment list \
        --assignee-object-id "$SYSTEM_PRINCIPAL_ID" \
        --scope "$CU_RBAC_SCOPE" \
        --query "[?roleDefinitionName=='$COG_SVC_ROLE']" \
        -o json --only-show-errors 2>/dev/null || echo "[]")
    CU_ROLE_COUNT=$(echo "$EXISTING_CU_ROLES" | jq 'length')
    if [[ "$CU_ROLE_COUNT" -eq 0 ]]; then
        echo "[+] Assign '$COG_SVC_ROLE' role for CU to system-assigned managed identity"
        az role assignment create \
            --assignee-object-id "$SYSTEM_PRINCIPAL_ID" \
            --assignee-principal-type ServicePrincipal \
            --role "$COG_SVC_ROLE" \
            --scope "$CU_RBAC_SCOPE" -o none 2>/dev/null || {
            _yellow "[WARN] Failed to assign '$COG_SVC_ROLE' role for CU. You may need to assign it manually."
        }
    else
        echo "[=] '$COG_SVC_ROLE' role already assigned for CU"
    fi
fi

# ========================================================================
# PERSISTENT STORAGE CONFIGURATION
# ========================================================================

if [[ "$STORAGE_MODE" == "smb" ]]; then
# ── SMB MODE ──────────────────────────────────────────────────

echo "[+] Configure persistent storage mount: $STORAGE_MOUNT_PATH"

# Step 1: Create or verify Storage Account
if ! az_resource_exists storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP_NAME" --only-show-errors; then
    echo "[+] Create storage account: $STORAGE_ACCOUNT_NAME"
    invoke_az storage account create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "$STORAGE_ACCOUNT_NAME" \
        --location "$LOCATION" \
        --kind StorageV2 \
        --sku Standard_LRS \
        --min-tls-version TLS1_2 \
        --enable-large-file-share \
        --allow-shared-key-access true \
        --default-action Allow \
        -o none
else
    echo "[=] Storage account exists: $STORAGE_ACCOUNT_NAME"

    SHARED_KEY_ACCESS=$(az storage account show \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --query allowSharedKeyAccess -o tsv 2>/dev/null || echo "")
    if [[ "${SHARED_KEY_ACCESS,,}" == "false" ]]; then
        echo "[+] Enable shared key access on storage account (required for SMB mount)"
        az storage account update \
            --name "$STORAGE_ACCOUNT_NAME" \
            --resource-group "$RESOURCE_GROUP_NAME" \
            --allow-shared-key-access true -o none 2>/dev/null || {
            _yellow "[WARN] Could not enable shared key access. SMB mount may fail."
        }
    fi

    CURRENT_DEFAULT_ACTION=$(az storage account show \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --query networkRuleSet.defaultAction -o tsv 2>/dev/null || echo "")
    if [[ "$CURRENT_DEFAULT_ACTION" == "Deny" ]]; then
        echo "[+] Enable public network access on storage account"
        invoke_az storage account update \
            --name "$STORAGE_ACCOUNT_NAME" \
            --resource-group "$RESOURCE_GROUP_NAME" \
            --default-action Allow -o none
    fi
fi

# Step 2: Create or verify File Share
if ! az_resource_exists storage share-rm show --resource-group "$RESOURCE_GROUP_NAME" --storage-account "$STORAGE_ACCOUNT_NAME" --name "$STORAGE_SHARE_NAME" --only-show-errors; then
    echo "[+] Create file share: $STORAGE_SHARE_NAME"
    invoke_az storage share-rm create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --storage-account "$STORAGE_ACCOUNT_NAME" \
        --name "$STORAGE_SHARE_NAME" \
        --quota "$STORAGE_SHARE_QUOTA_GIB" \
        --enabled-protocols SMB \
        -o none
else
    echo "[=] File share exists: $STORAGE_SHARE_NAME"
fi

# Step 3: Retrieve storage account key
STORAGE_ACCOUNT_KEY=$(az storage account keys list \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --account-name "$STORAGE_ACCOUNT_NAME" \
    --query "[0].value" -o tsv)
if [[ -z "$STORAGE_ACCOUNT_KEY" ]]; then
    _red "Failed to retrieve storage account key for: $STORAGE_ACCOUNT_NAME"
    exit 1
fi

# Step 4: Register environment storage
echo "[+] Register storage with Container Apps Environment"
invoke_az containerapp env storage set \
    --name "$CONTAINER_APPS_ENV_NAME" \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --storage-name "$ENVIRONMENT_STORAGE_NAME" \
    --storage-type AzureFile \
    --azure-file-account-name "$STORAGE_ACCOUNT_NAME" \
    --azure-file-account-key "$STORAGE_ACCOUNT_KEY" \
    --azure-file-share-name "$STORAGE_SHARE_NAME" \
    --access-mode ReadWrite -o none

_green "[OK] Storage registered"

# Step 5: Configure volume mount via ARM REST API
echo "[+] Configure volume mount on Container App: $STORAGE_MOUNT_PATH"

APP_JSON=$(az containerapp show \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP_NAME" -o json)
APP_RESOURCE_ID=$(echo "$APP_JSON" | jq -r '.id')

# Check if volume mount already exists
VOLUME_ALREADY_MOUNTED=$(echo "$APP_JSON" | jq -r \
    --arg vn "$STORAGE_VOLUME_NAME" \
    --arg sn "$ENVIRONMENT_STORAGE_NAME" \
    '[.properties.template.volumes // [] | .[] | select(.name == $vn and .storageName == $sn)] | length')

if [[ "$VOLUME_ALREADY_MOUNTED" -eq 0 ]]; then
    # Build patch body with jq
    PATCH_BODY=$(echo "$APP_JSON" | jq \
        --arg vn "$STORAGE_VOLUME_NAME" \
        --arg sn "$ENVIRONMENT_STORAGE_NAME" \
        --arg mp "$STORAGE_MOUNT_PATH" \
        '{
            properties: {
                template: (
                    .properties.template
                    | .volumes = ((.volumes // []) + [{name: $vn, storageName: $sn, storageType: "AzureFile"}])
                    | .containers[0].volumeMounts = ((.containers[0].volumeMounts // []) + [{volumeName: $vn, mountPath: $mp}])
                )
            }
        }')

    BODY_FILE=$(mktemp)
    echo "$PATCH_BODY" > "$BODY_FILE"

    API_VERSION="2024-03-01"
    az rest \
        --method patch \
        --url "https://management.azure.com${APP_RESOURCE_ID}?api-version=${API_VERSION}" \
        --body "@${BODY_FILE}" \
        --headers "Content-Type=application/json" -o none 2>/dev/null && {
        _green "[OK] Volume mount configured: $STORAGE_VOLUME_NAME -> $STORAGE_MOUNT_PATH"
    } || {
        _yellow "[WARN] Failed to configure volume mount via REST API."
        _yellow "       You can configure it manually in Azure Portal."
    }
    rm -f "$BODY_FILE"
else
    echo "[=] Volume mount already configured: $STORAGE_VOLUME_NAME -> $STORAGE_MOUNT_PATH"
fi

elif [[ "$STORAGE_MODE" == "blob" ]]; then
# ── BLOB MODE ─────────────────────────────────────────────────

echo "[+] Configure Blob Storage backend"

# Step 1: Create or verify Storage Account
if ! az_resource_exists storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP_NAME" --only-show-errors; then
    echo "[+] Create storage account: $STORAGE_ACCOUNT_NAME (blob mode, shared key access disabled)"
    invoke_az storage account create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "$STORAGE_ACCOUNT_NAME" \
        --location "$LOCATION" \
        --kind StorageV2 \
        --sku Standard_LRS \
        --min-tls-version TLS1_2 \
        --allow-shared-key-access false \
        --default-action Allow \
        -o none
else
    echo "[=] Storage account exists: $STORAGE_ACCOUNT_NAME"
fi

# Step 2: Assign Storage Blob Data Contributor role
STORAGE_ACCOUNT_ID=$(az storage account show \
    --name "$STORAGE_ACCOUNT_NAME" \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --query id -o tsv)

BLOB_ROLE="Storage Blob Data Contributor"
EXISTING_BLOB_ROLES=$(az role assignment list \
    --assignee-object-id "$SYSTEM_PRINCIPAL_ID" \
    --scope "$STORAGE_ACCOUNT_ID" \
    --query "[?roleDefinitionName=='$BLOB_ROLE']" \
    -o json --only-show-errors 2>/dev/null || echo "[]")
BLOB_ROLE_COUNT=$(echo "$EXISTING_BLOB_ROLES" | jq 'length')
if [[ "$BLOB_ROLE_COUNT" -eq 0 ]]; then
    echo "[+] Assign '$BLOB_ROLE' role to system-assigned managed identity"
    az role assignment create \
        --assignee-object-id "$SYSTEM_PRINCIPAL_ID" \
        --assignee-principal-type ServicePrincipal \
        --role "$BLOB_ROLE" \
        --scope "$STORAGE_ACCOUNT_ID" -o none 2>/dev/null && {
        _green "[OK] '$BLOB_ROLE' role assigned"
    } || {
        _yellow "[WARN] Failed to assign '$BLOB_ROLE' role. You may need to assign it manually."
    }
else
    echo "[=] '$BLOB_ROLE' role already assigned"
fi

# Step 3: Create blob container (via ARM API)
echo "[+] Ensure blob container exists: $BLOB_CONTAINER_NAME"
API_VERSION="2023-05-01"
CONTAINER_URL="https://management.azure.com${STORAGE_ACCOUNT_ID}/blobServices/default/containers/${BLOB_CONTAINER_NAME}?api-version=${API_VERSION}"
az rest \
    --method put \
    --url "$CONTAINER_URL" \
    --body '{"properties":{}}' \
    -o none 2>/dev/null && {
    _green "[OK] Blob container ready: $BLOB_CONTAINER_NAME"
} || {
    _yellow "[WARN] Could not create blob container. It may already exist."
}

_green "[OK] Blob Storage backend configured (no SMB mount needed)"

fi  # end storage mode

# ── Done ──────────────────────────────────────────────────────
FQDN=$(az containerapp show \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --query properties.configuration.ingress.fqdn -o tsv)
_green "[OK] Deployed: https://$FQDN/"
