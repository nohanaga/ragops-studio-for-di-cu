<p align="center">
  <img src="./static/icon.png" alt="RAGOps Studio for Document Intelligence / Content Understanding" width="240" height="240">
</p>


# RAGOps Studio for Document Intelligence / Content Understanding

![Azure DI](https://img.shields.io/badge/Azure-Document%20Intelligence-0078D4?style=flat-square&logo=microsoft-azure)
![Azure CU](https://img.shields.io/badge/Azure-Content%20Understanding-0078D4?style=flat-square&logo=microsoft-azure)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)
![PDF.js](https://img.shields.io/badge/PDF.js-v5-F7DF1E?style=flat-square)

RAG パイプラインの起点である **ドキュメント解析** を「試す → 見る → 直す → 比較する」サイクルで磨き込むためのワークベンチ。Azure AI **Document Intelligence (DI)** と **Content Understanding (CU)** の両方に対応し、ローカルでもコンテナでも即座に動かせる軽量の Flask ベースの Web ツールです。

> 📦 **RAGOps Studio シリーズ**
> - [RAGOps Studio — for Azure AI Search](https://github.com/nohanaga/ragops-studio): 検索インデックスの品質を観測・比較・改善するための React/TypeScript ベースのワークベンチ（シリーズ第一弾）
> - **RAGOps Studio — for DI/CU**（本リポジトリ）: ドキュメント解析レイヤーを磨き込むためのワークベンチ

- English version: [README.md](README.md)

![image.png](./docs/images/001.jpg)


## なぜ RAGOps Studio が必要か

RAG（Retrieval-Augmented Generation）の品質は、最初のドキュメント解析で決まります。モデルやオプションの違いが検索精度・回答品質にどう影響するかを素早くフィードバックできなければ、改善サイクルは回りません。

RAGOps Studio は、この **解析品質の継続的な観測・比較・改善** — いわゆる RAGOps の入り口 — を支えるためのツールです。

- **試す**: DI / CU のモデル・オプションをワンクリックで切り替えて解析
- **見る**: PDF/画像プレビュー上にバウンディングボックス (BBox) を重ね、「どこがどう取れているか」を視覚的に確認
- **直す**: オプションやモデルを変えてすぐ再実行。CU 派生アナライザーは自動管理
- **比較する**: 同一ドキュメントの複数バリアント結果をセマンティック Diff で構造比較

結果はすべてキャッシュされるため、API コストを抑えながら繰り返し検証できます。

### アーキテクチャ概要

- バックエンド: Flask（API + ジョブ管理 + ストレージ管理）
- フロントエンド: 素の HTML/CSS/JS（単一画面、Studio 風の 3 ペイン）
- 永続化: ローカルファイルシステム or Azure Blob Storage

## Features

### デュアルサービス対応
- **Document Intelligence (DI)** と **Content Understanding (CU)** を 1 つの画面で並行評価
- DI ↔ CU のワンクリック切り替え（サービスセレクター）
- DI: 30 種の組み込みモデル + カスタムモデル ID 手動入力
- CU: 47 種の組み込みアナライザー（リッチモデルピッカー：テキストフィルタリング・カテゴリグループ・米国専用トグル）

### 解析 & イテレーション
- Studio 風ワークフロー: ファイル選択 → モデル選択 → Analyze → Summary / Items / JSON 表示
- ジョブ実行: バックグラウンドスレッドで SDK 呼び出し → ポーリングで結果表示
- DI 解析オプション: `ocrHighResolution` / `formulas` / `barcodes` / `styleFont` / `pages` / `locale` / `output_content_format` / `query_fields` 等
- CU 解析オプション: 18 種の Processing Configuration のうち 16 種に対応（89%カバレッジ）
- CU 派生アナライザー自動管理: オプション変更時に `studio.<source>.<hash>` で派生アナライザーを自動作成

### ビジュアルインスペクション
- **PDF ビューア**: pdf.js v5 による描画 + SVG バウンディングボックス (BBox) オーバーレイ (Lines / Words / Paragraphs / Tables / KVP / SelectionMarks / Figures / Formulas / Barcodes)
- **メディアビューア**: 音声/動画ファイルのプレビュー再生
- **3D Structure ビューア**: ドキュメント要素の 3D 分解ビュー（🥚 イースターエッグ — 実用機能ではなくジョーク機能です）
- 「JSON を読む」のではなく「結果を見る」ことで、チャンクの切れ目やフィールド抽出の誤りに即座に気付ける

### キャッシュ・ライブラリ（結果の蓄積と比較）
- 結果キャッシュ: 同一ファイル (SHA-256) + 同一モデル + 同一オプション (SHA-1 署名) でキャッシュし再利用 → API コストを抑えつつ繰り返し検証
- ライブラリ表示: キャッシュ済みファイルをカード形式で一覧、バリアント別ロード・削除
- **結果比較モード (セマンティック Diff)**: 「モデル A vs B」「オプション X vs Y」を構造レベルで比較し、差分をハイライト表示 — RAG パイプラインへの影響を事前に評価

    ![image.png](./docs/images/002.png)

### ユーザータブ（業務シナリオデモ）
- `usertab/<lang>/` に HTML を配置すると結果パネルにカスタムタブとして自動追加（多言語対応）
- **デモ専用機能**: 業務シナリオにおける AI エージェントの実行結果サンプルを静的 HTML で表示するための仕組みです。実際のエージェント呼び出しや動的処理は行いません
- 同梱サンプル: 文字バリデーション、FSA リスク判定、法的条項チェック — いずれもエージェント出力の「見え方」を確認するためのモックです
- `window.__USERTAB_API__` 経由で解析結果データにアクセスできるため、将来的なエージェント連携のプロトタイプ用途にも利用可能

### UX
- 日本語 / 英語 の完全クライアントサイド切替（i18n）— ユーザータブも言語連動
- 5 テーマ: Dark / Light / Midnight / Forest / Solarized
- 既定ではアップロード有効（`UPLOADS_ENABLED=false` で無効化可能）

### ストレージ
- **ローカルモード** (`STORAGE_BACKEND=local`): `storage/` ディレクトリにファイル保存（デフォルト）
- **Blob モード** (`STORAGE_BACKEND=blob`): Azure Blob Storage に直接保存（`DefaultAzureCredential` / マネージド ID 認証）

### 認証

DI / CU それぞれ独立した認証設定を持ちます（`DI_AUTH_MODE` / `CU_AUTH_MODE`）:

| モード | 環境変数値 | 挙動 |
|---|---|---|
| **Auto** (デフォルト) | `auto` | `DI_KEY`/`CU_KEY` があればキー認証、なければ `DefaultAzureCredential` (マネージド ID / Entra ID) にフォールバック |
| **Key** | `key` | 常に API キー認証。キー未設定時はエラー |
| **Identity** | `identity` | 常に `DefaultAzureCredential`。API キー不要 |

- Blob ストレージ (`STORAGE_BACKEND=blob`): 常に `DefaultAzureCredential` を使用 — ストレージアカウントキーは一切不要

## 前提

- Python 3.10+ 推奨
- 以下のいずれか（または両方）:
  - Azure AI Document Intelligence の `endpoint`（+ `key` またはマネージド ID）
  - Azure AI Content Understanding の `endpoint`（+ `key` またはマネージド ID）

## セットアップ

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

`.env` を編集して、利用するサービスの環境変数を設定してください:

```bash
# Document Intelligence
DI_ENDPOINT=https://<your-di>.cognitiveservices.azure.com/
DI_KEY=<your-di-key>          # identity モードなら不要
# DI_AUTH_MODE=auto            # key / identity / auto (デフォルト: auto)

# Content Understanding
CU_ENDPOINT=https://<your-cu>.cognitiveservices.azure.com/
CU_KEY=<your-cu-key>
# CU_AUTH_MODE=auto

# ストレージ （デフォルト: local）
# STORAGE_BACKEND=local        # local / blob
# AZURE_STORAGE_ACCOUNT_NAME=  # blob モード時に必須
# AZURE_STORAGE_CONTAINER_NAME=appstorage

# UI
# UPLOADS_ENABLED=true         # false でアップロード無効化
# UI_DEFAULT_LANG=ja           # ja / en
```

## 起動

```bash
python app.py
```

起動後に `http://127.0.0.1:5000/` を開いてください。

## RAGOps ワークフロー例

1. **ベースライン取得**: ドキュメントをアップロードし、まず DI `prebuilt-layout` で解析 → 結果をキャッシュ
2. **オプション探索**: `ocrHighResolution`、`formulas` などのオプションを変えて再解析 → バリアントが自動的にライブラリに蓄積
3. **比較・評価**: ライブラリから複数バリアントを選択 → セマンティック Diff で「どのオプションが自分のドキュメントに最適か」を判断
4. **CU との比較**: 同じドキュメントを CU アナライザーでも解析 → DI と CU の結果を並べて比較
5. **業務シナリオのデモ**: ユーザータブに業務 AI エージェントの実行結果サンプルを配置し、解析結果と並べて表示（静的 HTML モック）
6. **本番パイプラインへ反映**: 最適なモデル + オプションの組み合わせを特定し、RAG パイプラインのインジェスト設定に適用

## 注意

- 本ツールは RAG 開発・検証フェーズでの利用を想定しています。プロダクション環境で常時稼働させる場合は Queue/Worker アーキテクチャ + 適切な認証・認可の導入を推奨します。
- PDF プレビューは `static/vendor/pdfjs/` 配下に PDF.js があればローカル優先で読み込み、無ければ CDN にフォールバックします。
  - オフライン/閉域網で使う場合は、PDF.js（`pdfjs-dist` のビルド成果物）を `static/vendor/pdfjs/` に配置してください。

## Azure Container Apps へのデプロイ

### 前提

- Azure CLI がインストール済みであること
- `az login` 済みであること
- 以下の Azure リソースが**事前に作成済み**であること（デプロイスクリプトでは作成されません）:
  - **Azure AI Document Intelligence** — エンドポイント URL を `--di-endpoint` / `-DiEndpoint` に指定
  - **Azure AI Content Understanding** (Azure AI Foundry 経由で作成した AI Services) — エンドポイント URL を `--cu-endpoint` / `-CuEndpoint` に指定
  - 少なくともどちらか 1 つが必要です

<details>
<summary>リソースの作成例（Azure CLI）</summary>

```bash
# Document Intelligence (FormRecognizer)
az cognitiveservices account create \
    --name <your-di-resource-name> \
    --resource-group <your-resource-group> \
    --kind FormRecognizer \
    --sku S0 \
    --location japaneast

# エンドポイント確認
az cognitiveservices account show \
    --name <your-di-resource-name> \
    --resource-group <your-resource-group> \
    --query properties.endpoint -o tsv
```

Content Understanding は Azure AI Foundry プロジェクトに紐づく **AI Services アカウント** のエンドポイントを使用します。
`--cu-resource-name` / `-CuResourceName` には `Microsoft.CognitiveServices/accounts` のリソース名を指定してください。

```bash
# 既存のリソース一覧を確認
az cognitiveservices account list -o table
```

</details>

### ストレージモード

デプロイスクリプトは 2 つのストレージモードをサポートします:

| モード | PowerShell | Bash | 永続化方式 | ストレージ認証 |
|---|---|---|---|---|
| **SMB** (デフォルト) | `-StorageMode smb` | `--storage-mode smb` | Azure Files ボリュームマウント (`/app/storage`) | ストレージアカウントキー (SMB の制約) |
| **Blob** | `-StorageMode blob` | `--storage-mode blob` | Azure Blob Storage SDK で直接 R/W | マネージド ID (`DefaultAzureCredential`) |

- **SMB モード**: スクリプトが Storage Account / File Share 作成 → CAE ストレージ登録 → ボリュームマウントまで自動設定
- **Blob モード**: スクリプトが Storage Account 作成 (`allowSharedKeyAccess=false`) → システム割り当て MI 有効化 → `Storage Blob Data Contributor` ロール付与 → Blob コンテナ作成まで自動設定

> ⚠️ Azure Policy で `allowSharedKeyAccess=false` が強制されている環境では SMB モードが使えません。`-StorageMode blob` を使用してください。

### DI 認証モード

デプロイスクリプトは DI の認証設定を自動構成します:

| モード | PowerShell | Bash | 説明 |
|---|---|---|---|
| **Key** (デフォルト) | `-DiAuthMode key` | `--di-auth-mode key` | API キーを Container Apps の secret に格納 |
| **Identity** | `-DiAuthMode identity` | `--di-auth-mode identity` | システム割り当て MI 有効化 + `Cognitive Services User` ロールを自動割り当て |

### CU 認証モード

デプロイスクリプトは CU の認証も同様にサポートします:

| モード | PowerShell | Bash | 説明 |
|---|---|---|---|
| **Key** (デフォルト) | `-CuAuthMode key` | `--cu-auth-mode key` | API キーを Container Apps の secret に格納 |
| **Identity** | `-CuAuthMode identity` | `--cu-auth-mode identity` | システム割り当て MI 有効化 + `Cognitive Services User` ロールを自動割り当て |

> 💡 DI と CU のうち少なくとも 1 つのエンドポイントが必要です。DI のみ・CU のみ・両方の構成に対応しています。

### デプロイ（初回: 作成 / 2回目以降: 更新）

> 💡 DI / CU のエンドポイントとキーは環境変数（`DI_ENDPOINT`, `DI_KEY`, `CU_ENDPOINT`, `CU_KEY`）でもコマンドライン引数でも渡せます。以下の例では環境変数を使用しています。
>
> スクリプトの主なデフォルト値: `-Location japaneast` / `-ResourceGroupName rg-ragops-studio` / `-AcrName acrragopsstudio`。変更したい場合のみ指定してください。

#### パターン 1: DI キー認証 + SMB ストレージ（最もシンプル）

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

#### パターン 2: DI マネージド ID + Blob ストレージ（キーレス）

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

#### パターン 3: DI + CU（両方キー認証）

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

#### パターン 4: DI + CU（両方マネージド ID、キーレス）

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

#### パターン 5: CU のみ（キー認証）

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

#### オプション

デフォルト値を変更したい場合のみ指定してください:

| PowerShell | Bash | デフォルト | 説明 |
|---|---|---|---|
| `-Location` | `--location` | `japaneast` | Azure リージョン |
| `-ResourceGroupName` | `--resource-group` | `rg-ragops-studio` | リソースグループ名 |
| `-AcrName` | `--acr-name` | `acrragopsstudio` | ACR 名 |
| `-StorageShareName "name"` | `--storage-share name` | `appstorage` | ファイル共有名（SMB モード） |
| `-StorageShareQuotaGiB 20` | `--storage-share-quota 20` | `10` | ファイル共有サイズ GiB（SMB モード） |
| `-BlobContainerName "name"` | `--blob-container name` | `appstorage` | Blob コンテナ名（Blob モード） |
| `-DiAuthMode key\|identity` | `--di-auth-mode key\|identity` | `key` | DI 認証モード |
| `-DiResourceName "name"` | `--di-resource-name name` | — | DI リソース名（identity モード時の RBAC スコープ指定） |
| `-DiResourceGroupName "name"` | `--di-resource-group name` | `--resource-group` と同じ | DI リソースグループ |
| `-CuAuthMode key\|identity` | `--cu-auth-mode key\|identity` | `key` | CU 認証モード |
| `-CuResourceName "name"` | `--cu-resource-name name` | — | CU リソース名（identity モード時の RBAC スコープ指定） |
| `-CuResourceGroupName "name"` | `--cu-resource-group name` | `--resource-group` と同じ | CU リソースグループ |

### 更新

同じコマンドをもう一度実行するだけで、ACR イメージを再ビルドし Container App を更新します。

- 更新時は通常エンドポイント/キーの再セット不要です（既存の secret/env を保持）
- キーをローテーションしたい場合は `-DiKey` / `-CuKey`（bash: `--di-key` / `--cu-key`）を渡すと secret を更新します
- 認証モードを切り替える場合は `-DiAuthMode` / `-CuAuthMode`（bash: `--di-auth-mode` / `--cu-auth-mode`）を指定してください

## Entra ID によるアクセス保護 (Easy Auth)

本アプリにはユーザーログイン機能が組み込まれていません。Azure Container Apps に外部公開 (external ingress) でデプロイする場合は、**組み込み認証 (Easy Auth)** を有効にして Microsoft Entra ID テナント内のユーザーのみにアクセスを制限することを推奨します。

### いつ有効にすべきか？

| シナリオ | 推奨 |
|---|---|
| ローカル (`localhost`) / VPN 内のみ | 不要 — ネットワーク分離で十分 |
| Azure Container Apps **internal** ingress | 推奨（多層防御） |
| Azure Container Apps **external** ingress | **強く推奨** — 認証なしでは全 API がインターネットから到達可能 |
| 機密文書を扱う場合 | **強く推奨** — アップロードファイルや解析結果が漏洩するリスク |

認証がない場合の主なリスク:
- 誰でも `POST /api/analyze` を呼べるため、DI/CU の API クォータを消費され課金が発生する
- `DELETE /api/library/<file_hash>` が保護されておらず、第三者にデータを削除される恐れがある
- 誰がどの操作をしたかの監査ログが残らない

### セットアップ手順（アプリコードの変更不要）

1. **Microsoft Entra ID にアプリを登録**

   ```bash
   az ad app create --display-name "RAGOps Studio" \
       --web-redirect-uris "https://<your-container-app-fqdn>/.auth/login/aad/callback" \
       --sign-in-audience AzureADMyOrg
   ```

   出力に含まれる `appId`（クライアント ID）を控えてください。

2. **Container App で認証を有効化**

   ```bash
   az containerapp auth microsoft update \
       --name <container-app-name> \
       --resource-group <resource-group> \
       --client-id <app-client-id> \
       --issuer "https://login.microsoftonline.com/<tenant-id>/v2.0" \
       --yes
   ```

3. **確認**: アプリの URL にアクセスすると、未認証ユーザーは Entra ID のログインページにリダイレクトされます。

> 💡 認証済みユーザーの情報はリクエストヘッダー `X-MS-CLIENT-PRINCIPAL-NAME` で取得でき、将来的な監査ログに活用できます。
>
> 詳細は [Azure Container Apps の認証と承認](https://learn.microsoft.com/ja-jp/azure/container-apps/authentication) を参照してください。

## ライセンス

このプロジェクトは [LICENSE](LICENSE) ファイルに基づいてライセンスされています。


これは個人的なプロジェクトであり、マイクロソフトの公式製品ではありません。本プロジェクトはコミュニティ主導で開発されており、現状のまま (AS-IS) で提供されます。マイクロソフトを含む開発者は、本ソフトウェアの使用に起因するいかなる問題についても責任を負わず、公式なサポートは提供されません。
