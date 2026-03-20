[CmdletBinding()]
param(
    [string]$SubscriptionId,
    [Parameter(Mandatory = $false)]
    [string]$Location = "japaneast",

    [Parameter(Mandatory = $false)]
    [string]$ResourceGroupName = "rg-ragops-studio",

    [Parameter(Mandatory = $false)]
    [string]$AcrName = "acrragopsstudio",

    [Parameter(Mandatory = $false)]
    [string]$ContainerAppsEnvironmentName = "cae-ragops-studio",

    [Parameter(Mandatory = $false)]
    [string]$ContainerAppName = "ca-ragops-studio",

    [Parameter(Mandatory = $false)]
    [string]$ImageRepo = "ragops-studio",

    [Parameter(Mandatory = $false)]
    [string]$ImageTag,

    [Parameter(Mandatory = $false)]
    [string]$IdentityName = "id-ragops-studio",

    [Parameter(Mandatory = $false)]
    [string]$LogAnalyticsWorkspaceName = "law-ragops-studio",

    [Parameter(Mandatory = $false)]
    [bool]$UploadsEnabled = $true,

    # === Persistent Storage Configuration (Azure Files) ===
    # Storage account name (auto-generated if not provided)
    [Parameter(Mandatory = $false)]
    [string]$StorageAccountName,

    # File share name for persistent data
    [Parameter(Mandatory = $false)]
    [string]$StorageShareName = "appstorage",

    # Environment storage reference name (used in Container Apps)
    [Parameter(Mandatory = $false)]
    [string]$EnvironmentStorageName = "appstorage",

    # Storage share size in GiB
    [Parameter(Mandatory = $false)]
    [int]$StorageShareQuotaGiB = 10,

    # Storage mode: "smb" (Azure Files SMB - requires storage account key)
    #               "blob" (Azure Blob Storage - uses DefaultAzureCredential / Managed Identity)
    [Parameter(Mandatory = $false)]
    [ValidateSet("smb", "blob")]
    [string]$StorageMode = "smb",

    # Blob container name (used when StorageMode=blob)
    [Parameter(Mandatory = $false)]
    [string]$BlobContainerName = "appstorage",

    # Document Intelligence
    [Parameter(Mandatory = $false)]
    [string]$DiEndpoint,

    [Parameter(Mandatory = $false)]
    [string]$DiKey,

    # Authentication mode: "key" (API key) or "identity" (Managed Identity / Entra ID)
    [Parameter(Mandatory = $false)]
    [ValidateSet("key", "identity")]
    [string]$DiAuthMode = "key",

    # Document Intelligence resource name (required for identity mode to assign RBAC role)
    [Parameter(Mandatory = $false)]
    [string]$DiResourceName,

    # Document Intelligence resource group (defaults to $ResourceGroupName)
    [Parameter(Mandatory = $false)]
    [string]$DiResourceGroupName,

    # Content Understanding
    [Parameter(Mandatory = $false)]
    [string]$CuEndpoint,

    [Parameter(Mandatory = $false)]
    [string]$CuKey,

    # Authentication mode: "key" (API key) or "identity" (Managed Identity / Entra ID)
    [Parameter(Mandatory = $false)]
    [ValidateSet("key", "identity")]
    [string]$CuAuthMode = "key",

    # Content Understanding resource name (required for identity mode to assign RBAC role)
    [Parameter(Mandatory = $false)]
    [string]$CuResourceName,

    # Content Understanding resource group (defaults to $ResourceGroupName)
    [Parameter(Mandatory = $false)]
    [string]$CuResourceGroupName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

function Assert-AzCli {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw "Azure CLI (az) was not found. Please install Azure CLI first."
    }
}

function Invoke-Az {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $raw = & az @Args 2>&1
    }
    finally {
        $ErrorActionPreference = $prevEap
    }

    $exitCode = $LASTEXITCODE

    # Normalize to string to avoid returning ErrorRecord objects.
    $text = ($raw | ForEach-Object { $_.ToString() } | Out-String).TrimEnd()

    if ($exitCode -ne 0) {
        if (-not $text) { $text = "Azure CLI command failed with exit code $exitCode." }
        $cmd = "az " + ($Args -join " ")
        throw ($cmd + "`n" + $text)
    }

    return $text
}

function Remove-AzCliWarnings {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $lines = ($Text -split "`r?`n")
    $filtered = $lines | Where-Object {
        $l = $_
        if (-not $l) { return $true }
        return (-not $l.TrimStart().StartsWith("WARNING:"))
    }
    return ($filtered -join "`n").Trim()
}



function ConvertFrom-AzJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [AllowEmptyString()]
        [string]$Text
    )

    begin {
        $sb = New-Object System.Text.StringBuilder
    }

    process {
        if ($null -ne $Text) {
            [void]$sb.AppendLine($Text)
        }
    }

    end {
        $t = $sb.ToString().Trim()
        if (-not $t -or $t -eq "null") {
            return $null
        }

        # Azure CLI sometimes emits WARNING lines (stderr) before JSON.
        # Extract the first JSON object/array payload.
        $objIdx = $t.IndexOf('{')
        $arrIdx = $t.IndexOf('[')

        $start = -1
        if ($objIdx -ge 0 -and $arrIdx -ge 0) {
            $start = [Math]::Min($objIdx, $arrIdx)
        }
        elseif ($objIdx -ge 0) {
            $start = $objIdx
        }
        elseif ($arrIdx -ge 0) {
            $start = $arrIdx
        }

        if ($start -gt 0) {
            $t = $t.Substring($start).TrimStart()
        }

        return $t | ConvertFrom-Json
    }
}

function Get-DefaultImageTag {
    param([string]$Tag)

    if ($Tag) { return $Tag }

    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        try {
            $t = (git rev-parse --short HEAD 2>$null).Trim()
            if ($t) { return $t }
        }
        catch {
        }
    }

    return (Get-Date -Format 'yyyyMMdd-HHmmss')
}

function Get-Sha256Hex {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $hash = $sha.ComputeHash($bytes)
        return -join ($hash | ForEach-Object { $_.ToString("x2") })
    }
    finally {
        $sha.Dispose()
    }
}

function Get-DefaultStorageAccountName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResourceGroup,
        [Parameter(Mandatory = $true)]
        [string]$AppName
    )

    # Storage account name: 3-24 chars, lowercase letters and numbers only.
    $clean = ($AppName -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
    if (-not $clean) { $clean = "app" }
    if ($clean.Length -gt 14) { $clean = $clean.Substring(0, 14) }

    $suffix = (Get-Sha256Hex -Text ("{0}|{1}" -f $ResourceGroup, $AppName)).Substring(0, 8)
    return ("st{0}{1}" -f $clean, $suffix).ToLowerInvariant()
}

function Get-ServiceSettings {
    <#
    .SYNOPSIS
    Retrieves a Cognitive Service endpoint (and optionally key) from parameters or environment.
    When AuthMode is 'identity', key is not required.
    #>
    param(
        [string]$ServiceName,
        [string]$Endpoint,
        [string]$Key,
        [string]$AuthMode = "key",
        [string]$EndpointEnvVar,
        [string]$KeyEnvVar
    )

    if (-not $Endpoint) { $Endpoint = [System.Environment]::GetEnvironmentVariable($EndpointEnvVar) }
    if (-not $Endpoint) {
        throw "Missing $EndpointEnvVar. Provide the endpoint parameter or set env var $EndpointEnvVar."
    }

    if ($AuthMode -eq "key") {
        if (-not $Key) { $Key = [System.Environment]::GetEnvironmentVariable($KeyEnvVar) }
        if (-not $Key) {
            throw "Missing $KeyEnvVar. Provide the key parameter or set env var $KeyEnvVar (required for key auth mode)."
        }
    }

    return @{
        Endpoint = $Endpoint
        Key      = $Key
        AuthMode = $AuthMode
    }
}

function Get-DISettings {
    param(
        [string]$Endpoint,
        [string]$Key,
        [string]$AuthMode = "key"
    )
    return Get-ServiceSettings -ServiceName "Document Intelligence" `
        -Endpoint $Endpoint -Key $Key -AuthMode $AuthMode `
        -EndpointEnvVar "DI_ENDPOINT" -KeyEnvVar "DI_KEY"
}

function Get-CUSettings {
    param(
        [string]$Endpoint,
        [string]$Key,
        [string]$AuthMode = "key"
    )
    return Get-ServiceSettings -ServiceName "Content Understanding" `
        -Endpoint $Endpoint -Key $Key -AuthMode $AuthMode `
        -EndpointEnvVar "CU_ENDPOINT" -KeyEnvVar "CU_KEY"
}

function Test-StorageConfiguration {
    <#
    .SYNOPSIS
    Validates storage configuration parameters
    
    .DESCRIPTION
    Checks that storage account name meets Azure naming requirements
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$StorageAccountName,
        [Parameter(Mandatory = $true)]
        [string]$StorageShareName
    )

    # Storage account name validation (3-24 chars, lowercase alphanumeric only)
    if ($StorageAccountName -notmatch '^[a-z0-9]{3,24}$') {
        throw "Invalid storage account name: $StorageAccountName. Must be 3-24 characters, lowercase letters and numbers only."
    }

    # File share name validation (3-63 chars, lowercase alphanumeric and hyphens)
    if ($StorageShareName -notmatch '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$') {
        throw "Invalid file share name: $StorageShareName. Must be 3-63 characters, lowercase letters, numbers, and hyphens."
    }

    Write-Host "[OK] Storage configuration validated" -ForegroundColor Green
}

function Test-AzResourceExists {
    <#
    .SYNOPSIS
    Tests if an Azure resource exists by running a show command
    
    .DESCRIPTION
    Executes the provided show command and returns true if successful, false if resource not found
    #>
    param([ScriptBlock]$ShowCommand)

    try {
        & $ShowCommand | Out-Null
        return $true
    }
    catch {
        return $false
    }
}



Assert-AzCli

if ($SubscriptionId) {
    Invoke-Az @("account", "set", "--subscription", $SubscriptionId) | Out-Null
}

try {
    Invoke-Az @("extension", "add", "--name", "containerapp", "--upgrade") | Out-Null
}
catch {
    # Newer az may have containerapp built-in.
}

$ImageTag = Get-DefaultImageTag -Tag $ImageTag
$uploadsEnvValue = if ($UploadsEnabled) { "true" } else { "false" }

# Resolve resource groups (defaults to main resource group)
if (-not $DiResourceGroupName) { $DiResourceGroupName = $ResourceGroupName }
if (-not $CuResourceGroupName) { $CuResourceGroupName = $ResourceGroupName }

# Detect which services are configured
$diConfigured = [bool]($DiEndpoint -or $env:DI_ENDPOINT)
$cuConfigured = [bool]($CuEndpoint -or $env:CU_ENDPOINT)

Write-Host "[INFO] Services:" -ForegroundColor Cyan
if ($diConfigured) {
    Write-Host "  - Document Intelligence: enabled (auth=$DiAuthMode)" -ForegroundColor Cyan
} else {
    Write-Host "  - Document Intelligence: not configured" -ForegroundColor Yellow
}
if ($cuConfigured) {
    Write-Host "  - Content Understanding: enabled (auth=$CuAuthMode)" -ForegroundColor Cyan
} else {
    Write-Host "  - Content Understanding: not configured" -ForegroundColor Yellow
}

# === Storage Configuration ===
# Storage account and file share names (normalized to lowercase)
$storageAccount = if ($StorageAccountName) { 
    $StorageAccountName.ToLowerInvariant() 
} else { 
    Get-DefaultStorageAccountName -ResourceGroup $ResourceGroupName -AppName $ContainerAppName 
}
$storageShare = $StorageShareName.ToLowerInvariant()

# Validate storage configuration
Test-StorageConfiguration -StorageAccountName $storageAccount -StorageShareName $storageShare

# Environment storage reference name (as registered in Container Apps Environment)
$envStorageName = $EnvironmentStorageName

# Default mount path and volume name (for reference in messages)
$storageMountPath = "/app/storage"
$storageVolumeName = "app-storage"

Write-Host "[INFO] Storage configuration:" -ForegroundColor Cyan
Write-Host "  - Storage Account: $storageAccount" -ForegroundColor Cyan
Write-Host "  - File Share: $storageShare" -ForegroundColor Cyan
Write-Host "  - Environment Storage Name: $envStorageName" -ForegroundColor Cyan
Write-Host "  - Recommended Mount Path: $storageMountPath" -ForegroundColor Cyan
Write-Host "  - Recommended Volume Name: $storageVolumeName" -ForegroundColor Cyan
Write-Host "  - Storage Mode: $StorageMode" -ForegroundColor Cyan
if ($StorageMode -eq "blob") {
    Write-Host "  - Blob Container: $BlobContainerName" -ForegroundColor Cyan
}

# Resource Group
$rgExists = (Invoke-Az @("group", "exists", "--name", $ResourceGroupName)).Trim().ToLowerInvariant()
if ($rgExists -ne "true") {
    Write-Host "[+] Create resource group: $ResourceGroupName ($Location)"
    Invoke-Az @("group", "create", "--name", $ResourceGroupName, "--location", $Location) | Out-Null
}
else {
    Write-Host "[=] Resource group exists: $ResourceGroupName"
}

# ACR (create once; reuse on subsequent deploys)
$acrExists = Test-AzResourceExists { Invoke-Az @("acr", "show", "--name", $AcrName, "--resource-group", $ResourceGroupName, "--only-show-errors") }
if (-not $acrExists) {
    Write-Host "[+] Create ACR: $AcrName"
    Invoke-Az @(
        "acr", "create",
        "--name", $AcrName,
        "--resource-group", $ResourceGroupName,
        "--location", $Location,
        "--sku", "Basic",
        "--admin-enabled", "false"
    ) | Out-Null
}
else {
    Write-Host "[=] ACR exists: $AcrName"
}

# Enable ARM audience tokens for managed-identity image pull (if supported)
try {
    $authArmStatus = (Invoke-Az @("acr", "config", "authentication-as-arm", "show", "-r", $AcrName, "--query", "status", "-o", "tsv")).Trim().ToLowerInvariant()
    if ($authArmStatus -ne "enabled") {
        Write-Host "[+] Enable ACR authentication-as-arm"
        Invoke-Az @("acr", "config", "authentication-as-arm", "update", "-r", $AcrName, "--status", "enabled") | Out-Null
    }
}
catch {
    # Some clouds/CLI versions may not support this; proceed.
}

$acrLoginServer = (Invoke-Az @("acr", "show", "--name", $AcrName, "--resource-group", $ResourceGroupName, "--query", "loginServer", "--output", "tsv")).Trim()
$acrId = (Invoke-Az @("acr", "show", "--name", $AcrName, "--resource-group", $ResourceGroupName, "--query", "id", "--output", "tsv")).Trim()

# User-assigned managed identity for ACR pull
$identityExists = Test-AzResourceExists { Invoke-Az @("identity", "show", "--name", $IdentityName, "--resource-group", $ResourceGroupName, "--only-show-errors") }
if (-not $identityExists) {
    Write-Host "[+] Create managed identity: $IdentityName"
    Invoke-Az @("identity", "create", "--name", $IdentityName, "--resource-group", $ResourceGroupName, "--location", $Location) | Out-Null
}
else {
    Write-Host "[=] Managed identity exists: $IdentityName"
}

$identityId = (Invoke-Az @("identity", "show", "--name", $IdentityName, "--resource-group", $ResourceGroupName, "--query", "id", "--output", "tsv")).Trim()
$principalId = (Invoke-Az @("identity", "show", "--name", $IdentityName, "--resource-group", $ResourceGroupName, "--query", "principalId", "--output", "tsv")).Trim()

# AcrPull role assignment (idempotent)
$existingAssignments = (Invoke-Az @(
        "role", "assignment", "list",
        "--assignee-object-id", $principalId,
        "--scope", $acrId,
        "--query", "[?roleDefinitionName=='AcrPull']",
        "--output", "json",
        "--only-show-errors"
    ) | ConvertFrom-AzJson)
if (-not $existingAssignments -or $existingAssignments.Count -eq 0) {
    Write-Host "[+] Assign AcrPull role to identity"
    try {
        Invoke-Az @(
            "role", "assignment", "create",
            "--assignee-object-id", $principalId,
            "--assignee-principal-type", "ServicePrincipal",
            "--role", "AcrPull",
            "--scope", $acrId
        ) | Out-Null
    }
    catch {
        # Ignore conflicts from parallel/previous runs.
    }
}
else {
    Write-Host "[=] AcrPull role already assigned"
}

# Log Analytics (for Container Apps environment)
$lawExists = Test-AzResourceExists { Invoke-Az @("monitor", "log-analytics", "workspace", "show", "--resource-group", $ResourceGroupName, "--workspace-name", $LogAnalyticsWorkspaceName, "--only-show-errors") }
if (-not $lawExists) {
    Write-Host "[+] Create Log Analytics workspace: $LogAnalyticsWorkspaceName"
    Invoke-Az @(
        "monitor", "log-analytics", "workspace", "create",
        "--resource-group", $ResourceGroupName,
        "--workspace-name", $LogAnalyticsWorkspaceName,
        "--location", $Location
    ) | Out-Null
}
else {
    Write-Host "[=] Log Analytics workspace exists: $LogAnalyticsWorkspaceName"
}

$lawCustomerId = (Invoke-Az @(
        "monitor", "log-analytics", "workspace", "show",
        "--resource-group", $ResourceGroupName,
        "--workspace-name", $LogAnalyticsWorkspaceName,
        "--query", "customerId",
        "--output", "tsv"
    )).Trim()
$lawSharedKey = (Invoke-Az @(
        "monitor", "log-analytics", "workspace", "get-shared-keys",
        "--resource-group", $ResourceGroupName,
        "--workspace-name", $LogAnalyticsWorkspaceName,
        "--query", "primarySharedKey",
        "--output", "tsv"
    )).Trim()

# Container Apps environment
$caeExists = Test-AzResourceExists { Invoke-Az @("containerapp", "env", "show", "--name", $ContainerAppsEnvironmentName, "--resource-group", $ResourceGroupName, "--only-show-errors") }
if (-not $caeExists) {
    Write-Host "[+] Create Container Apps environment: $ContainerAppsEnvironmentName"
    Invoke-Az @(
        "containerapp", "env", "create",
        "--name", $ContainerAppsEnvironmentName,
        "--resource-group", $ResourceGroupName,
        "--location", $Location,
        "--logs-workspace-id", $lawCustomerId,
        "--logs-workspace-key", $lawSharedKey
    ) | Out-Null
}
else {
    Write-Host "[=] Container Apps environment exists: $ContainerAppsEnvironmentName"
}

# Build & push to existing ACR
$imageRef = "{0}:{1}" -f $ImageRepo, $ImageTag
Write-Host "[+] Build image in ACR: $imageRef"
Invoke-Az @(
    "acr", "build",
    "--registry", $AcrName,
    "--resource-group", $ResourceGroupName,
    "--image", $imageRef,
    "."
)

$fullImage = "$acrLoginServer/$imageRef"

# Container App create/update
$appExists = Test-AzResourceExists { Invoke-Az @("containerapp", "show", "--name", $ContainerAppName, "--resource-group", $ResourceGroupName, "--only-show-errors") }

if (-not $appExists) {
    Write-Host "[+] Create Container App: $ContainerAppName"

    # On create, at least one service (DI or CU) must be configured.
    if (-not $diConfigured -and -not $cuConfigured) {
        throw "At least one service must be configured. Provide DI_ENDPOINT (-DiEndpoint) and/or CU_ENDPOINT (-CuEndpoint)."
    }

    # Resolve service settings
    $di = $null
    $cu = $null
    if ($diConfigured) {
        $di = Get-DISettings -Endpoint $DiEndpoint -Key $DiKey -AuthMode $DiAuthMode
    }
    if ($cuConfigured) {
        $cu = Get-CUSettings -Endpoint $CuEndpoint -Key $CuKey -AuthMode $CuAuthMode
    }

    # Build secrets list
    $secretsList = @()
    if ($di -and $DiAuthMode -eq "key") {
        $secretsList += @("di-endpoint=$($di.Endpoint)", "di-key=$($di.Key)")
    }
    if ($cu -and $CuAuthMode -eq "key") {
        $secretsList += @("cu-endpoint=$($cu.Endpoint)", "cu-key=$($cu.Key)")
    }

    # Build env vars list
    $envVarsList = @("UPLOADS_ENABLED=$uploadsEnvValue")
    if ($di) {
        if ($DiAuthMode -eq "identity") {
            $envVarsList += @("DI_ENDPOINT=$($di.Endpoint)", "DI_AUTH_MODE=identity")
        } else {
            $envVarsList += @("DI_ENDPOINT=secretref:di-endpoint", "DI_KEY=secretref:di-key", "DI_AUTH_MODE=key")
        }
    }
    if ($cu) {
        if ($CuAuthMode -eq "identity") {
            $envVarsList += @("CU_ENDPOINT=$($cu.Endpoint)", "CU_AUTH_MODE=identity")
        } else {
            $envVarsList += @("CU_ENDPOINT=secretref:cu-endpoint", "CU_KEY=secretref:cu-key", "CU_AUTH_MODE=key")
        }
    }
    if ($StorageMode -eq "blob") {
        $envVarsList += @("STORAGE_BACKEND=blob", "AZURE_STORAGE_ACCOUNT_NAME=$storageAccount", "AZURE_STORAGE_CONTAINER_NAME=$BlobContainerName")
    }

    $createArgs = @(
        "containerapp", "create",
        "--name", $ContainerAppName,
        "--resource-group", $ResourceGroupName,
        "--environment", $ContainerAppsEnvironmentName,
        "--image", $fullImage,
        "--ingress", "external",
        "--target-port", "8000",
        "--user-assigned", $identityId,
        "--registry-identity", $identityId,
        "--registry-server", $acrLoginServer
    )
    if ($secretsList.Count -gt 0) {
        $createArgs += @("--secrets") + $secretsList
    }
    $createArgs += @("--env-vars") + $envVarsList

    Invoke-Az $createArgs | Out-Null
}
else {
    Write-Host "[=] Container App exists: $ContainerAppName (update)"

    # Ensure user-assigned identity is assigned (for ACR pull)
    try {
        Invoke-Az @(
            "containerapp", "identity", "assign",
            "--name", $ContainerAppName,
            "--resource-group", $ResourceGroupName,
            "--identities", $identityId
        ) | Out-Null
    }
    catch {
    }

    # Ensure registry uses managed identity
    try {
        Invoke-Az @(
            "containerapp", "registry", "set",
            "--name", $ContainerAppName,
            "--resource-group", $ResourceGroupName,
            "--server", $acrLoginServer,
            "--identity", $identityId
        ) | Out-Null
    }
    catch {
    }

    # Update secrets/env only if service settings are explicitly provided.
    # If not provided, keep existing secrets/env as-is.

    # ── DI settings ────────────────────────────────────────────
    $di = $null
    if ($DiAuthMode -eq "identity") {
        $anyDiInputProvided = ($DiEndpoint -or $env:DI_ENDPOINT)
    }
    else {
        $anyDiInputProvided = ($DiEndpoint -or $DiKey -or $env:DI_ENDPOINT -or $env:DI_KEY)
    }
    if ($anyDiInputProvided) {
        $di = Get-DISettings -Endpoint $DiEndpoint -Key $DiKey -AuthMode $DiAuthMode

        if ($DiAuthMode -eq "identity") {
            foreach ($s in @("di-key", "di-endpoint")) {
                try { Invoke-Az @("containerapp", "secret", "remove", "--name", $ContainerAppName, "--resource-group", $ResourceGroupName, "--secret-names", $s) | Out-Null } catch {}
            }
        }
        else {
            Invoke-Az @(
                "containerapp", "secret", "set",
                "--name", $ContainerAppName,
                "--resource-group", $ResourceGroupName,
                "--secrets", "di-endpoint=$($di.Endpoint)", "di-key=$($di.Key)"
            ) | Out-Null
        }
    }
    else {
        Write-Host "[=] DI settings not provided; keeping existing DI secrets/env" -ForegroundColor Yellow
    }

    # ── CU settings ────────────────────────────────────────────
    $cu = $null
    if ($CuAuthMode -eq "identity") {
        $anyCuInputProvided = ($CuEndpoint -or $env:CU_ENDPOINT)
    }
    else {
        $anyCuInputProvided = ($CuEndpoint -or $CuKey -or $env:CU_ENDPOINT -or $env:CU_KEY)
    }
    if ($anyCuInputProvided) {
        $cu = Get-CUSettings -Endpoint $CuEndpoint -Key $CuKey -AuthMode $CuAuthMode

        if ($CuAuthMode -eq "identity") {
            foreach ($s in @("cu-key", "cu-endpoint")) {
                try { Invoke-Az @("containerapp", "secret", "remove", "--name", $ContainerAppName, "--resource-group", $ResourceGroupName, "--secret-names", $s) | Out-Null } catch {}
            }
        }
        else {
            Invoke-Az @(
                "containerapp", "secret", "set",
                "--name", $ContainerAppName,
                "--resource-group", $ResourceGroupName,
                "--secrets", "cu-endpoint=$($cu.Endpoint)", "cu-key=$($cu.Key)"
            ) | Out-Null
        }
    }
    else {
        Write-Host "[=] CU settings not provided; keeping existing CU secrets/env" -ForegroundColor Yellow
    }

    # ── Build env vars ─────────────────────────────────────────
    $setEnvVars = @("UPLOADS_ENABLED=$uploadsEnvValue")
    if ($di) {
        $setEnvVars += @("DI_AUTH_MODE=$DiAuthMode")
        if ($DiAuthMode -eq "identity") {
            $setEnvVars += @("DI_ENDPOINT=$($di.Endpoint)")
        }
        else {
            $setEnvVars += @("DI_ENDPOINT=secretref:di-endpoint", "DI_KEY=secretref:di-key")
        }
    }
    if ($cu) {
        $setEnvVars += @("CU_AUTH_MODE=$CuAuthMode")
        if ($CuAuthMode -eq "identity") {
            $setEnvVars += @("CU_ENDPOINT=$($cu.Endpoint)")
        }
        else {
            $setEnvVars += @("CU_ENDPOINT=secretref:cu-endpoint", "CU_KEY=secretref:cu-key")
        }
    }
    if ($StorageMode -eq "blob") {
        $setEnvVars += @("STORAGE_BACKEND=blob", "AZURE_STORAGE_ACCOUNT_NAME=$storageAccount", "AZURE_STORAGE_CONTAINER_NAME=$BlobContainerName")
    }

    $updateArgs = @(
        "containerapp", "update",
        "--name", $ContainerAppName,
        "--resource-group", $ResourceGroupName,
        "--image", $fullImage,
        "--set-env-vars"
    ) + $setEnvVars

    Invoke-Az $updateArgs | Out-Null
}

# ========================================================================
# SYSTEM-ASSIGNED MANAGED IDENTITY & RBAC FOR IDENTITY AUTH (DI / CU)
# ========================================================================
# When either DI or CU uses identity auth, enable system-assigned managed
# identity on the Container App and assign 'Cognitive Services User' role
# so it can call the respective APIs.
# (User-assigned identity is kept for ACR pull only.)
# ========================================================================
$needsSystemIdentity = ($DiAuthMode -eq "identity" -and $diConfigured) -or ($CuAuthMode -eq "identity" -and $cuConfigured) -or ($StorageMode -eq "blob")

if ($needsSystemIdentity) {
    Write-Host "[+] Enable system-assigned managed identity on Container App"
    Invoke-Az @(
        "containerapp", "identity", "assign",
        "--name", $ContainerAppName,
        "--resource-group", $ResourceGroupName,
        "--system-assigned"
    ) | Out-Null

    # Retrieve system-assigned identity principalId
    $systemPrincipalId = (Invoke-Az @(
        "containerapp", "show",
        "--name", $ContainerAppName,
        "--resource-group", $ResourceGroupName,
        "--query", "identity.principalId",
        "--output", "tsv"
    )).Trim()

    if (-not $systemPrincipalId) {
        throw "Failed to retrieve system-assigned managed identity principalId for Container App: $ContainerAppName"
    }
    Write-Host "[INFO] System-assigned identity principalId: $systemPrincipalId" -ForegroundColor Cyan
}

# ── Assign Cognitive Services User role for DI identity mode ──
if ($DiAuthMode -eq "identity" -and $diConfigured) {
    Write-Host "[+] Configure RBAC for identity-based Document Intelligence access"

    if ($DiResourceName) {
        $diResourceId = (Invoke-Az @(
            "cognitiveservices", "account", "show",
            "--name", $DiResourceName,
            "--resource-group", $DiResourceGroupName,
            "--query", "id",
            "--output", "tsv"
        )).Trim()
        $diRbacScope = $diResourceId
        Write-Host "[INFO] DI RBAC scope: resource '$DiResourceName'" -ForegroundColor Cyan
    }
    else {
        $rgId = (Invoke-Az @(
            "group", "show",
            "--name", $DiResourceGroupName,
            "--query", "id",
            "--output", "tsv"
        )).Trim()
        $diRbacScope = $rgId
        Write-Host "[INFO] DI RBAC scope: resource group '$DiResourceGroupName' (specify -DiResourceName for narrower scope)" -ForegroundColor Yellow
    }

    $cogSvcRole = "Cognitive Services User"
    $existingDiAssignments = (Invoke-Az @(
        "role", "assignment", "list",
        "--assignee-object-id", $systemPrincipalId,
        "--scope", $diRbacScope,
        "--query", "[?roleDefinitionName=='$cogSvcRole']",
        "--output", "json",
        "--only-show-errors"
    ) | ConvertFrom-AzJson)

    if (-not $existingDiAssignments -or $existingDiAssignments.Count -eq 0) {
        Write-Host "[+] Assign '$cogSvcRole' role for DI to system-assigned managed identity"
        try {
            Invoke-Az @(
                "role", "assignment", "create",
                "--assignee-object-id", $systemPrincipalId,
                "--assignee-principal-type", "ServicePrincipal",
                "--role", $cogSvcRole,
                "--scope", $diRbacScope
            ) | Out-Null
        }
        catch {
            Write-Host "[WARN] Failed to assign '$cogSvcRole' role for DI. You may need to assign it manually." -ForegroundColor Yellow
            Write-Host "       Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "[=] '$cogSvcRole' role already assigned for DI"
    }
}

# ── Assign Cognitive Services User role for CU identity mode ──
if ($CuAuthMode -eq "identity" -and $cuConfigured) {
    Write-Host "[+] Configure RBAC for identity-based Content Understanding access"

    if ($CuResourceName) {
        $cuResourceId = (Invoke-Az @(
            "cognitiveservices", "account", "show",
            "--name", $CuResourceName,
            "--resource-group", $CuResourceGroupName,
            "--query", "id",
            "--output", "tsv"
        )).Trim()
        $cuRbacScope = $cuResourceId
        Write-Host "[INFO] CU RBAC scope: resource '$CuResourceName'" -ForegroundColor Cyan
    }
    else {
        $rgId = (Invoke-Az @(
            "group", "show",
            "--name", $CuResourceGroupName,
            "--query", "id",
            "--output", "tsv"
        )).Trim()
        $cuRbacScope = $rgId
        Write-Host "[INFO] CU RBAC scope: resource group '$CuResourceGroupName' (specify -CuResourceName for narrower scope)" -ForegroundColor Yellow
    }

    $cogSvcRole = "Cognitive Services User"
    $existingCuAssignments = (Invoke-Az @(
        "role", "assignment", "list",
        "--assignee-object-id", $systemPrincipalId,
        "--scope", $cuRbacScope,
        "--query", "[?roleDefinitionName=='$cogSvcRole']",
        "--output", "json",
        "--only-show-errors"
    ) | ConvertFrom-AzJson)

    if (-not $existingCuAssignments -or $existingCuAssignments.Count -eq 0) {
        Write-Host "[+] Assign '$cogSvcRole' role for CU to system-assigned managed identity"
        try {
            Invoke-Az @(
                "role", "assignment", "create",
                "--assignee-object-id", $systemPrincipalId,
                "--assignee-principal-type", "ServicePrincipal",
                "--role", $cogSvcRole,
                "--scope", $cuRbacScope
            ) | Out-Null
        }
        catch {
            Write-Host "[WARN] Failed to assign '$cogSvcRole' role for CU. You may need to assign it manually." -ForegroundColor Yellow
            Write-Host "       Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "[=] '$cogSvcRole' role already assigned for CU"
    }
}

# ========================================================================
# PERSISTENT STORAGE CONFIGURATION
# ========================================================================

if ($StorageMode -eq "smb") {
# ── SMB MODE ───────────────────────────────────────────────────
# Configure Azure Files (SMB) to provide persistent storage for the
# Container App.  SMB mounts in Container Apps **require** storage account
# key authentication, so we explicitly ensure:
#   - allowSharedKeyAccess = true
#   - Network default action = Allow (Container Apps connect via public IP
#     unless VNet-integrated)
# ═══════════════════════════════════════════════════════════════

Write-Host "[+] Configure persistent storage mount: $storageMountPath"

# ── Step 1: Create or verify Storage Account ──────────────────
$saExists = Test-AzResourceExists { Invoke-Az @("storage", "account", "show", "--name", $storageAccount, "--resource-group", $ResourceGroupName, "--only-show-errors") }
if (-not $saExists) {
    Write-Host "[+] Create storage account: $storageAccount"
    Invoke-Az @(
        "storage", "account", "create",
        "--resource-group", $ResourceGroupName,
        "--name", $storageAccount,
        "--location", $Location,
        "--kind", "StorageV2",
        "--sku", "Standard_LRS",
        "--min-tls-version", "TLS1_2",
        "--enable-large-file-share",
        "--allow-shared-key-access", "true",
        "--default-action", "Allow",
        "--output", "none"
    ) | Out-Null
}
else {
    Write-Host "[=] Storage account exists: $storageAccount"

    # Ensure shared key access is enabled (required for Azure Files SMB mount)
    $sharedKeyAccess = (Invoke-Az @(
        "storage", "account", "show",
        "--name", $storageAccount,
        "--resource-group", $ResourceGroupName,
        "--query", "allowSharedKeyAccess",
        "--output", "tsv"
    )).Trim().ToLowerInvariant()

    if ($sharedKeyAccess -eq "false") {
        Write-Host "[+] Enable shared key access on storage account (required for SMB mount)"
        try {
            Invoke-Az @(
                "storage", "account", "update",
                "--name", $storageAccount,
                "--resource-group", $ResourceGroupName,
                "--allow-shared-key-access", "true",
                "--output", "none"
            ) | Out-Null
        }
        catch {
            Write-Host "[WARN] Could not enable shared key access." -ForegroundColor Yellow
            Write-Host "       If Azure Policy enforces allowSharedKeyAccess=false, the SMB volume mount will fail." -ForegroundColor Yellow
            Write-Host "       Consider exempting this storage account from the policy or using ephemeral storage." -ForegroundColor Yellow
        }
    }

    # Ensure public network access is allowed
    $currentDefaultAction = (Invoke-Az @(
        "storage", "account", "show",
        "--name", $storageAccount,
        "--resource-group", $ResourceGroupName,
        "--query", "networkRuleSet.defaultAction",
        "--output", "tsv"
    )).Trim()

    if ($currentDefaultAction -eq "Deny") {
        Write-Host "[+] Enable public network access on storage account (required for Container Apps SMB mount without VNet)"
        Invoke-Az @(
            "storage", "account", "update",
            "--name", $storageAccount,
            "--resource-group", $ResourceGroupName,
            "--default-action", "Allow",
            "--output", "none"
        ) | Out-Null
    }
}

# ── Step 2: Create or verify Azure File Share ─────────────────
$shareExists = Test-AzResourceExists { Invoke-Az @("storage", "share-rm", "show", "--resource-group", $ResourceGroupName, "--storage-account", $storageAccount, "--name", $storageShare, "--only-show-errors") }
if (-not $shareExists) {
    Write-Host "[+] Create file share: $storageShare"
    Invoke-Az @(
        "storage", "share-rm", "create",
        "--resource-group", $ResourceGroupName,
        "--storage-account", $storageAccount,
        "--name", $storageShare,
        "--quota", "$StorageShareQuotaGiB",
        "--enabled-protocols", "SMB",
        "--output", "none"
    ) | Out-Null
}
else {
    Write-Host "[=] File share exists: $storageShare"
}

# ── Step 3: Retrieve storage account key ──────────────────────
$storageAccountKey = (Invoke-Az @(
        "storage", "account", "keys", "list",
        "--resource-group", $ResourceGroupName,
        "--account-name", $storageAccount,
        "--query", "[0].value",
        "--output", "tsv"
    )).Trim()

if (-not $storageAccountKey) {
    throw "Failed to retrieve storage account key for: $storageAccount"
}

# ── Step 4: Register / update environment storage ─────────────
# Use 'set' directly (idempotent for key updates; no remove needed).
Write-Host "[+] Register storage with Container Apps Environment"
Invoke-Az @(
    "containerapp", "env", "storage", "set",
    "--name", $ContainerAppsEnvironmentName,
    "--resource-group", $ResourceGroupName,
    "--storage-name", $envStorageName,
    "--storage-type", "AzureFile",
    "--azure-file-account-name", $storageAccount,
    "--azure-file-account-key", $storageAccountKey,
    "--azure-file-share-name", $storageShare,
    "--access-mode", "ReadWrite"
) | Out-Null

# Verify registration
$storageInfo = Invoke-Az @(
    "containerapp", "env", "storage", "show",
    "--name", $ContainerAppsEnvironmentName,
    "--resource-group", $ResourceGroupName,
    "--storage-name", $envStorageName,
    "--output", "json"
) | ConvertFrom-AzJson

if ($storageInfo) {
    Write-Host "[OK] Storage registered: account=$($storageInfo.properties.azureFile.accountName), share=$($storageInfo.properties.azureFile.shareName), access=$($storageInfo.properties.azureFile.accessMode)" -ForegroundColor Green
}
else {
    throw "Failed to verify storage registration"
}

# ── Step 5: Configure volume mount on Container App ───────────
# Use ARM REST API (JSON MERGE PATCH) so we can programmatically add
# volumes + volumeMounts without hand-crafting YAML.
Write-Host "[+] Configure volume mount on Container App: $storageMountPath"

$appData = Invoke-Az @(
    "containerapp", "show",
    "--name", $ContainerAppName,
    "--resource-group", $ResourceGroupName,
    "--output", "json"
) | ConvertFrom-AzJson

# Check if volume mount already exists
$volumeAlreadyMounted = $false
if ($appData.properties.template.volumes) {
    foreach ($v in $appData.properties.template.volumes) {
        if ($v.name -eq $storageVolumeName -and $v.storageName -eq $envStorageName) {
            $volumeAlreadyMounted = $true
            break
        }
    }
}

if (-not $volumeAlreadyMounted) {
    # Clone the current template so we preserve all settings (env vars, scale, etc.)
    $template = $appData.properties.template

    # -- Add volumes array --
    $newVolume = [PSCustomObject]@{
        name        = $storageVolumeName
        storageName = $envStorageName
        storageType = "AzureFile"
    }
    if ($template.volumes) {
        # Append (PowerShell arrays are immutable, so rebuild)
        $template.volumes = @($template.volumes) + @($newVolume)
    }
    else {
        $template | Add-Member -NotePropertyName "volumes" -NotePropertyValue @($newVolume) -Force
    }

    # -- Add volumeMounts on the first container --
    $container = $template.containers[0]
    $newMount = [PSCustomObject]@{
        volumeName = $storageVolumeName
        mountPath  = $storageMountPath
    }
    if ($container.volumeMounts) {
        $container.volumeMounts = @($container.volumeMounts) + @($newMount)
    }
    else {
        $container | Add-Member -NotePropertyName "volumeMounts" -NotePropertyValue @($newMount) -Force
    }

    # Build PATCH body (only template section — ARM merges the rest)
    $patchBody = @{ properties = @{ template = $template } }
    $bodyJson = $patchBody | ConvertTo-Json -Depth 30 -Compress
    $bodyFile = Join-Path $env:TEMP "ca-volume-update-$([guid]::NewGuid().ToString('N').Substring(0,8)).json"
    [System.IO.File]::WriteAllText($bodyFile, $bodyJson, [System.Text.Encoding]::UTF8)

    $appResourceId = $appData.id
    $apiVersion = "2024-03-01"

    try {
        Invoke-Az @(
            "rest",
            "--method", "patch",
            "--url", "https://management.azure.com${appResourceId}?api-version=${apiVersion}",
            "--body", "@${bodyFile}",
            "--headers", "Content-Type=application/json"
        ) | Out-Null
        Write-Host "[OK] Volume mount configured: $storageVolumeName -> $storageMountPath" -ForegroundColor Green
    }
    catch {
        Write-Host "[WARN] Failed to configure volume mount via REST API." -ForegroundColor Yellow
        Write-Host "       Error: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "       You can configure it manually in Azure Portal: Container App > Containers > Edit > Volume mounts" -ForegroundColor Yellow
    }
    finally {
        Remove-Item $bodyFile -ErrorAction SilentlyContinue
    }
}
else {
    Write-Host "[=] Volume mount already configured: $storageVolumeName -> $storageMountPath"
}

}  # end StorageMode -eq "smb"
elseif ($StorageMode -eq "blob") {
# ── BLOB MODE ──────────────────────────────────────────────────
# Azure Blob Storage with DefaultAzureCredential (Managed Identity).
# No storage account key required.
# ═══════════════════════════════════════════════════════════════

Write-Host "[+] Configure Blob Storage backend"

# ── Step 1: Create or verify Storage Account ──────────────────
$saExists = Test-AzResourceExists { Invoke-Az @("storage", "account", "show", "--name", $storageAccount, "--resource-group", $ResourceGroupName, "--only-show-errors") }
if (-not $saExists) {
    Write-Host "[+] Create storage account: $storageAccount (blob mode, shared key access disabled)"
    Invoke-Az @(
        "storage", "account", "create",
        "--resource-group", $ResourceGroupName,
        "--name", $storageAccount,
        "--location", $Location,
        "--kind", "StorageV2",
        "--sku", "Standard_LRS",
        "--min-tls-version", "TLS1_2",
        "--allow-shared-key-access", "false",
        "--default-action", "Allow",
        "--output", "none"
    ) | Out-Null
}
else {
    Write-Host "[=] Storage account exists: $storageAccount"
}

# ── Step 2: Assign Storage Blob Data Contributor role ─────────
# System-assigned MI was already enabled in the RBAC section above.
$storageAccountId = (Invoke-Az @(
    "storage", "account", "show",
    "--name", $storageAccount,
    "--resource-group", $ResourceGroupName,
    "--query", "id",
    "--output", "tsv"
)).Trim()

$blobRole = "Storage Blob Data Contributor"
$existingBlobAssignments = (Invoke-Az @(
    "role", "assignment", "list",
    "--assignee-object-id", $systemPrincipalId,
    "--scope", $storageAccountId,
    "--query", "[?roleDefinitionName=='$blobRole']",
    "--output", "json",
    "--only-show-errors"
) | ConvertFrom-AzJson)

if (-not $existingBlobAssignments -or $existingBlobAssignments.Count -eq 0) {
    Write-Host "[+] Assign '$blobRole' role to system-assigned managed identity"
    try {
        Invoke-Az @(
            "role", "assignment", "create",
            "--assignee-object-id", $systemPrincipalId,
            "--assignee-principal-type", "ServicePrincipal",
            "--role", $blobRole,
            "--scope", $storageAccountId
        ) | Out-Null
        Write-Host "[OK] '$blobRole' role assigned" -ForegroundColor Green
    }
    catch {
        Write-Host "[WARN] Failed to assign '$blobRole' role. You may need to assign it manually." -ForegroundColor Yellow
        Write-Host "       Error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
else {
    Write-Host "[=] '$blobRole' role already assigned"
}

# ── Step 4: Create blob container (via ARM API) ──────────────
Write-Host "[+] Ensure blob container exists: $BlobContainerName"
$apiVersion = "2023-05-01"
$containerUrl = "https://management.azure.com${storageAccountId}/blobServices/default/containers/${BlobContainerName}?api-version=${apiVersion}"
try {
    Invoke-Az @(
        "rest",
        "--method", "put",
        "--url", $containerUrl,
        "--body", '{"properties":{}}',
        "--output", "none"
    ) | Out-Null
    Write-Host "[OK] Blob container ready: $BlobContainerName" -ForegroundColor Green
}
catch {
    Write-Host "[WARN] Could not create blob container. It may already exist or you may need to create it manually." -ForegroundColor Yellow
    Write-Host "       Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "[OK] Blob Storage backend configured (no SMB mount needed)" -ForegroundColor Green

}  # end StorageMode -eq "blob"

# ── Done ──────────────────────────────────────────────────────
$fqdn = (Invoke-Az @(
        "containerapp", "show",
        "--name", $ContainerAppName,
        "--resource-group", $ResourceGroupName,
        "--query", "properties.configuration.ingress.fqdn",
        "--output", "tsv"
    )).Trim()
Write-Host "[OK] Deployed: https://$fqdn/"
