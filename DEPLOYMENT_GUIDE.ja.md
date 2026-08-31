# RAGOps Studio デプロイガイド

RAGOps Studio for Document Intelligence / Content Understanding を Azure Container Apps に配置する手順です。

- English version: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- プロジェクト概要: [README.ja.md](README.ja.md)

## デプロイ方法の選択

| 方法 | 対象 | ストレージ | 認証 |
|---|---|---|---|
| Azure Developer CLI (`azd`) | 新規環境を一括作成する場合（推奨） | Azure Blob Storage | User Assigned Managed Identity |
| Azure CLI スクリプト | 既存の DI / CU リソースを利用する場合 | Azure Files SMB または Blob Storage | API キーまたは Managed Identity |

## Azure Developer CLI によるデプロイ（推奨）

このリポジトリには [Azure Developer CLI（`azd`）](https://learn.microsoft.com/ja-jp/azure/developer/azure-developer-cli/overview) テンプレートが含まれています。インフラストラクチャのプロビジョニング、リポジトリ直下の Dockerfile のリモートビルド、Azure Container Apps への配置を一つのワークフローで実行します。

### 前提条件

- [Azure Developer CLI をインストール](https://learn.microsoft.com/ja-jp/azure/developer/azure-developer-cli/install-azd)してください。
- 必要な Azure リソースを作成できるサブスクリプションを使用してください。
- デプロイを実行する ID にはロール割り当ての作成権限が必要です。`Owner`、または `User Access Administrator` とリソース作成権限の組み合わせで要件を満たします。
- [Content Understanding 対応リージョン](https://learn.microsoft.com/ja-jp/azure/ai-services/content-understanding/language-region-support)を選択してください。`japaneast` は対応リージョンです。

### プロビジョニングとデプロイ

```bash
azd auth login
azd up
```

初回実行時に、環境名、サブスクリプション、リージョンを選択します。ローカルで Docker を起動する必要はありません。[azure.yaml](azure.yaml) の `remoteBuild: true` により、コンテナーイメージは Azure Container Registry でビルドされます。

`azd up` は次のリソースを作成します。

- Azure AI Document Intelligence
- Content Understanding 用 Microsoft Foundry リソース
- Azure Container Registry
- Azure Container Apps 環境および Container App
- Azure Storage アカウントおよび非公開 Blob コンテナー
- Log Analytics ワークスペース
- User Assigned Managed Identity および必要な Azure RBAC ロール割り当て

実行時の Document Intelligence、Content Understanding、Blob Storage、ACR へのアクセスはキーレスです。[infra/resources.bicep](infra/resources.bicep) は、対応するリソースのローカル認証を無効化し、API キーを Container Apps の設定へ格納せずに Managed Identity を構成します。

### Container Apps に設定される値

`azd up` は次の実行設定を自動的に適用します。Azure ポータルで同じ値を重複して設定する必要はありません。

| 設定 | 値 | 用途 |
|---|---|---|
| Ingress | External、HTTPS、ターゲットポート `8000` | Web UI と API の公開 |
| コンテナーポート | `PORT=8000` | Gunicorn の待受ポート |
| ID | User Assigned Managed Identity | DI、CU、Blob Storage、ACR のキーレス認証 |
| `AZURE_CLIENT_ID` | 作成された User Assigned Managed Identity のクライアント ID | `DefaultAzureCredential` が使用する ID を明示 |
| `DI_ENDPOINT` | 作成された Document Intelligence のエンドポイント | DI API の接続先 |
| `DI_AUTH_MODE` | `identity` | DI で Managed Identity を使用 |
| `CU_ENDPOINT` | 作成された Microsoft Foundry リソースのルートエンドポイント | CU API の接続先 |
| `CU_AUTH_MODE` | `identity` | CU で Managed Identity を使用 |
| `STORAGE_BACKEND` | `blob` | Azure Blob Storage SDK による直接読み書き |
| `AZURE_STORAGE_ACCOUNT_NAME` | 作成されたストレージアカウント名 | Blob 接続先 |
| `AZURE_STORAGE_CONTAINER_NAME` | `appstorage` | Blob コンテナー名 |
| `UPLOADS_ENABLED` | `true` | ファイルアップロードを有効化 |
| `USER_TABS_ENABLED` | `false` | ユーザータブを無効化 |

この構成では Azure Files のボリュームを使用しません。Container App の `/app/storage` にボリュームを追加せず、Blob コンテナーへ SDK で直接アクセスします。

### デプロイ後の確認

デプロイ先 URL を取得します。

```bash
azd env get-value AZURE_CONTAINER_APP_URI
```

次の項目を確認してください。

1. URL を開いて Web UI が表示される。
2. ファイルをアップロードできる。
3. DI または CU で解析を実行できる。
4. Container App のログに Blob Storage の `403 AuthorizationFailure` が継続して記録されていない。

Azure RBAC のロール割り当ては反映に時間がかかる場合があります。配置直後だけ `403` が発生した場合は、ロール割り当てを確認し、反映後にアクティブなリビジョンを再起動してください。Blob データアクセスのロールについては、[Azure Blob データへのアクセス用ロールの割り当て](https://learn.microsoft.com/ja-jp/azure/storage/blobs/assign-azure-role-data-access)を参照してください。

### 更新

アプリケーションのみを更新する場合:

```bash
azd deploy
```

アプリケーションとインフラストラクチャを更新する場合:

```bash
azd up
```

動作の詳細は [Azure Developer CLI の Container Apps ワークフロー](https://learn.microsoft.com/ja-jp/azure/developer/azure-developer-cli/container-apps-workflows)を参照してください。

> Content Understanding の生成系アナライザーでは、対応する Foundry モデルの配置とリソースレベルのモデル既定値が追加で必要になる場合があります。これらはリージョンごとのモデル提供状況とサブスクリプションのクォータに依存するため、このテンプレートでは作成しません。必要な場合は [Content Understanding のモデル配置手順](https://learn.microsoft.com/ja-jp/azure/ai-services/content-understanding/concepts/models-deployments)に従って構成してください。

## Azure CLI スクリプトによるデプロイ

既存の DI / CU リソースを利用する場合は、[scripts/deploy_aca.ps1](scripts/deploy_aca.ps1) または [scripts/deploy_aca.sh](scripts/deploy_aca.sh) を使用できます。

### 前提条件

- Azure CLI がインストール済みであること
- `az login` 済みであること
- 次のうち少なくとも一つが作成済みであること
  - Azure AI Document Intelligence
  - Content Understanding 用 Microsoft Foundry リソース

Document Intelligence リソースの作成例:

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

Content Understanding には Microsoft Foundry リソースのルートエンドポイントを使用します。`--cu-resource-name` / `-CuResourceName` には `Microsoft.CognitiveServices/accounts` のリソース名を指定してください。

### ストレージモード

| モード | PowerShell | Bash | 永続化方式 | ストレージ認証 |
|---|---|---|---|---|
| SMB（既定） | `-StorageMode smb` | `--storage-mode smb` | Azure Files を `/app/storage` にマウント | ストレージアカウントキー |
| Blob | `-StorageMode blob` | `--storage-mode blob` | Azure Blob Storage SDK で直接読み書き | Managed Identity |

- SMB モードでは、スクリプトがストレージアカウント、ファイル共有、Container Apps 環境のストレージ登録、ボリュームマウントを構成します。
- Blob モードでは、スクリプトが共有キーを無効化したストレージアカウント、Managed Identity、`Storage Blob Data Contributor`、Blob コンテナーを構成します。
- Azure Policy で `allowSharedKeyAccess=false` が強制されている環境では SMB モードを使用できません。

### Azure ポータルで SMB を手動設定する場合

SMB モードでは Blob コンテナーではなく、クラシック Azure Files 共有を `/app/storage` にマウントします。Container Apps の Azure Files マウントはストレージアカウントキーを使用します。キーレス構成が必要な場合は Blob モードを使用してください。

> `azd up` が作成するストレージアカウントは `allowSharedKeyAccess=false` の Blob 専用構成です。SMB を手動構成する場合は、共有キーアクセスを許可した専用ストレージアカウントを使用してください。

1. Azure Files 共有を作成します。

   | 項目 | 設定例 |
   |---|---|
   | ストレージアカウント | `stragopssmb<一意な文字列>` |
   | アカウントの種類 | `StorageV2` |
   | 共有キーアクセス | 有効 |
   | ファイル共有 | `appstorage` |
   | プロトコル | SMB |
   | クォータ | `10 GiB` 以上 |

2. Container App ではなく、対象の Container Apps 環境で **設定** → **ボリューム マウント** → **追加** を選択します。

   | 項目 | 設定例 |
   |---|---|
   | プロトコル | SMB |
   | 名前 | `ragops-smb` |
   | ストレージアカウント名 | `stragopssmb<一意な文字列>` |
   | ストレージアカウントキー | 対象アカウントのキー 1 またはキー 2 |
   | ファイル共有 | `appstorage` |
   | アクセスモード | Read/Write |

3. Container App の **アプリケーション** → **リビジョンとレプリカ** → **新しいリビジョンの作成** → **ボリューム** で設定します。

   | 項目 | 設定例 |
   |---|---|
   | ボリュームタイプ | Azure file volume |
   | ボリューム名 | `ragops-storage` |
   | ファイル共有名 | `ragops-smb` |
   | マウントオプション | 空欄 |

4. `app` コンテナーの **ボリューム マウント** で設定します。

   | 項目 | 設定例 |
   |---|---|
   | ボリューム名 | `ragops-storage` |
   | マウントパス | `/app/storage` |
   | サブパス | 空欄 |

5. Container App の環境変数を設定します。

   | 環境変数 | 値 | 備考 |
   |---|---|---|
   | `STORAGE_BACKEND` | `local` | `/app/storage` をローカルファイルシステムとして使用 |
   | `PORT` | `8000` | Gunicorn の待受ポート |
   | `UPLOADS_ENABLED` | `true` | ファイルアップロードを有効化 |
   | `AZURE_STORAGE_ACCOUNT_NAME` | 削除 | Blob モード専用 |
   | `AZURE_STORAGE_CONTAINER_NAME` | 削除 | Blob モード専用 |

サブパスを指定する場合は、ファイル共有ルートからの相対パスを指定し、先頭に `/` を付けないでください。新しいリビジョンを作成後、`/app/storage/uploads`、`/app/storage/results`、`/app/storage/cache` が Azure Files 上に作成されることを確認します。

複数レプリカから同じファイルを更新する競合を避けるため、このアプリの SMB 構成では最大レプリカ数 `1` を推奨します。公式手順は [Azure Container Apps でストレージマウントを使用する](https://learn.microsoft.com/ja-jp/azure/container-apps/storage-mounts#azure-files-volume)を参照してください。

### DI / CU 認証モード

| モード | PowerShell | Bash | 説明 |
|---|---|---|---|
| Key（既定） | `-DiAuthMode key` / `-CuAuthMode key` | `--di-auth-mode key` / `--cu-auth-mode key` | API キーを Container Apps のシークレットに格納 |
| Identity | `-DiAuthMode identity` / `-CuAuthMode identity` | `--di-auth-mode identity` / `--cu-auth-mode identity` | System Assigned Managed Identity と `Cognitive Services User` ロールを構成 |

Identity モードでは、対応する `-DiResourceName` / `-CuResourceName` または `--di-resource-name` / `--cu-resource-name` も指定します。

### デプロイ例

#### DI キー認証 + SMB

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

#### DI + CU、両方 Managed Identity + Blob

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

CU のみを使う場合は、`CU_ENDPOINT` と必要な認証オプションだけを設定します。DI / CU のエンドポイントとキーは、環境変数または対応するコマンドライン引数で渡せます。

### 主なオプション

| PowerShell | Bash | 既定値 | 説明 |
|---|---|---|---|
| `-Location` | `--location` | `japaneast` | Azure リージョン |
| `-ResourceGroupName` | `--resource-group` | `rg-ragops-studio` | リソースグループ名 |
| `-AcrName` | `--acr-name` | `acrragopsstudio` | ACR 名 |
| `-StorageShareName` | `--storage-share` | `appstorage` | SMB ファイル共有名 |
| `-StorageShareQuotaGiB` | `--storage-share-quota` | `10` | SMB ファイル共有サイズ |
| `-BlobContainerName` | `--blob-container` | `appstorage` | Blob コンテナー名 |
| `-DiAuthMode` | `--di-auth-mode` | `key` | DI 認証モード |
| `-DiResourceName` | `--di-resource-name` | なし | Identity モードの DI リソース名 |
| `-CuAuthMode` | `--cu-auth-mode` | `key` | CU 認証モード |
| `-CuResourceName` | `--cu-resource-name` | なし | Identity モードの CU リソース名 |

全オプションは各スクリプトのヘルプを参照してください。

### 更新

同じスクリプトを再実行すると、イメージを再ビルドして Container App を更新します。

- 通常はエンドポイントやキーの再設定は不要です。
- キーをローテーションする場合は `-DiKey` / `-CuKey`、または `--di-key` / `--cu-key` を指定します。
- 認証モードを切り替える場合は、新しい認証モードを明示します。

## Entra ID によるアクセス保護（Easy Auth）

本アプリにはユーザーログイン機能が組み込まれていません。Azure Container Apps を External Ingress で公開する場合は、[組み込み認証](https://learn.microsoft.com/ja-jp/azure/container-apps/authentication)を有効にして、Microsoft Entra ID テナント内のユーザーだけにアクセスを制限することを推奨します。

| シナリオ | 推奨 |
|---|---|
| ローカルまたは VPN 内のみ | ネットワーク分離で保護可能 |
| Internal Ingress | 多層防御として推奨 |
| External Ingress | 強く推奨 |
| 機密文書を扱う場合 | 強く推奨 |

認証がない場合、第三者による解析 API の利用、API クォータ消費、データ削除、監査性の不足につながります。

### セットアップ

1. Microsoft Entra ID にアプリを登録します。

```bash
az ad app create --display-name "RAGOps Studio" \
    --web-redirect-uris "https://<your-container-app-fqdn>/.auth/login/aad/callback" \
    --sign-in-audience AzureADMyOrg
```

2. 出力された `appId` を使って Container App の認証を有効化します。

```bash
az containerapp auth microsoft update \
    --name <container-app-name> \
    --resource-group <resource-group> \
    --client-id <app-client-id> \
    --issuer "https://login.microsoftonline.com/<tenant-id>/v2.0" \
    --yes
```

3. アプリ URL を開き、未認証ユーザーが Entra ID のログインページへリダイレクトされることを確認します。

認証済みユーザーの情報は `X-MS-CLIENT-PRINCIPAL-NAME` リクエストヘッダーで取得できます。

## 公式資料

- [Azure Developer CLI の概要](https://learn.microsoft.com/ja-jp/azure/developer/azure-developer-cli/overview)
- [Azure Developer CLI の Container Apps ワークフロー](https://learn.microsoft.com/ja-jp/azure/developer/azure-developer-cli/container-apps-workflows)
- [Azure Container Apps のストレージマウント](https://learn.microsoft.com/ja-jp/azure/container-apps/storage-mounts)
- [Azure Container Apps の Managed Identity](https://learn.microsoft.com/ja-jp/azure/container-apps/managed-identity)
- [Azure Container Apps の認証と承認](https://learn.microsoft.com/ja-jp/azure/container-apps/authentication)
- [Content Understanding のリージョンサポート](https://learn.microsoft.com/ja-jp/azure/ai-services/content-understanding/language-region-support)
