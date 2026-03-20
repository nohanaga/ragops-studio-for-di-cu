# RAGOps Studio for Document Intelligence / Content Understanding

RAG パイプラインの起点である **ドキュメント解析** を「試す → 見る → 直す → 比較する」サイクルで磨き込むためのワークベンチ。Azure AI **Document Intelligence (DI)** と **Content Understanding (CU)** の両方に対応し、ローカルでもコンテナでも即座に動かせる Flask ベースの Web ツールです。

- English version: [README.md](README.md)

## なぜ RAGOps Studio が必要か

RAG（Retrieval-Augmented Generation）の品質は、最初のドキュメント解析で決まります。モデルやオプションの違いが検索精度・回答品質にどう影響するかを素早くフィードバックできなければ、改善サイクルは回りません。

RAGOps Studio は、この **解析品質の継続的な観測・比較・改善** — いわゆる RAGOps の入り口 — を支えるためのツールです。

- **試す**: DI / CU のモデル・オプションをワンクリックで切り替えて解析
- **見る**: PDF/画像プレビュー上に BBox を重ね、「どこがどう取れているか」を視覚的に確認
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
- **PDF ビューア**: pdf.js v5 による描画 + SVG BBox オーバーレイ (Lines / Words / Paragraphs / Tables / KVP / SelectionMarks / Figures / Formulas / Barcodes)
- **メディアビューア**: 音声/動画ファイルのプレビュー再生
- **3D Structure ビューア**: ドキュメント要素の 3D 分解ビュー
- 「JSON を読む」のではなく「結果を見る」ことで、チャンクの切れ目やフィールド抽出の誤りに即座に気付ける

### キャッシュ・ライブラリ（結果の蓄積と比較）
- 結果キャッシュ: 同一ファイル (SHA-256) + 同一モデル + 同一オプション (SHA-1 署名) でキャッシュし再利用 → API コストを抑えつつ繰り返し検証
- ライブラリ表示: キャッシュ済みファイルをカード形式で一覧、バリアント別ロード・削除
- **結果比較モード (セマンティック Diff)**: 「モデル A vs B」「オプション X vs Y」を構造レベルで比較し、差分をハイライト表示 — RAG パイプラインへの影響を事前に評価

### ユーザータブ（業務シナリオデモ）
- `usertab/<lang>/` に HTML を配置すると結果パネルにカスタムタブとして自動追加（多言語対応）
- **デモ専用機能**: 業務シナリオにおける AI エージェントの実行結果サンプルを静的 HTML で表示するための仕組みです。実際のエージェント呼び出しや動的処理は行いません
- 同梱サンプル: 文字バリデーション、FSA リスク判定、法的条項チェック — いずれもエージェント出力の「見え方」を確認するためのモックです
- `window.__USERTAB_API__` 経由で解析結果データにアクセスできるため、将来的なエージェント連携のプロトタイプ用途にも利用可能

### UX
- 日本語 / 英語 の完全クライアントサイド切替（i18n）— ユーザータブも言語連動
- 5 テーマ: Dark / Light / Midnight / Forest / Solarized
- 安全策: 既定ではアップロード無効（`UPLOADS_ENABLED` で有効化）

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
# UPLOADS_ENABLED=false        # true でアップロード有効化
# UI_DEFAULT_LANG=ja           # ja / en
```

## 起動

```powershell
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
- DI / CU のエンドポイント（+ キーまたはマネージド ID）を用意していること

### ストレージモード

デプロイスクリプトは 2 つのストレージモードをサポートします:

| モード | スクリプトオプション | 永続化方式 | ストレージ認証 |
|---|---|---|---|
| **SMB** (デフォルト) | `-StorageMode smb` | Azure Files ボリュームマウント (`/app/storage`) | ストレージアカウントキー (SMB の制約) |
| **Blob** | `-StorageMode blob` | Azure Blob Storage SDK で直接 R/W | マネージド ID (`DefaultAzureCredential`) |

- **SMB モード**: スクリプトが Storage Account / File Share 作成 → CAE ストレージ登録 → ボリュームマウントまで自動設定
- **Blob モード**: スクリプトが Storage Account 作成 (`allowSharedKeyAccess=false`) → システム割り当て MI 有効化 → `Storage Blob Data Contributor` ロール付与 → Blob コンテナ作成まで自動設定

> ⚠️ Azure Policy で `allowSharedKeyAccess=false` が強制されている環境では SMB モードが使えません。`-StorageMode blob` を使用してください。

### DI 認証モード

デプロイスクリプトは DI の認証設定を自動構成します:

| モード | スクリプトオプション | 説明 |
|---|---|---|
| **Key** (デフォルト) | `-DiAuthMode key` | API キーを Container Apps の secret に格納 |
| **Identity** | `-DiAuthMode identity` | システム割り当て MI 有効化 + `Cognitive Services User` ロールを自動割り当て |

### CU 認証モード

デプロイスクリプトは CU の認証も同様にサポートします:

| モード | スクリプトオプション | 説明 |
|---|---|---|
| **Key** (デフォルト) | `-CuAuthMode key` | API キーを Container Apps の secret に格納 |
| **Identity** | `-CuAuthMode identity` | システム割り当て MI 有効化 + `Cognitive Services User` ロールを自動割り当て |

> 💡 DI と CU のうち少なくとも 1 つのエンドポイントが必要です。DI のみ・CU のみ・両方の構成に対応しています。

### デプロイ（初回: 作成 / 2回目以降: 更新）

**パターン 1: DI キー認証 + SMB ストレージ（最もシンプル）**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"
$env:DI_KEY = "<your-di-key>"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -AcrName <uniqueacrname>
```

**パターン 2: DI マネージド ID + Blob ストレージ（キーレス）**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -AcrName <uniqueacrname> `
    -DiAuthMode identity `
    -DiResourceName <your-di-resource-name> `
    -StorageMode blob
```

**パターン 3: DI + CU（両方キー認証）**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"
$env:DI_KEY = "<your-di-key>"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -AcrName <uniqueacrname> `
    -CuEndpoint "https://<your-cu>.cognitiveservices.azure.com/" `
    -CuKey "<your-cu-key>"
```

**パターン 4: DI + CU（両方マネージド ID、キーレス）**

```powershell
$env:DI_ENDPOINT = "https://<your-di>.cognitiveservices.azure.com/"

./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -AcrName <uniqueacrname> `
    -DiAuthMode identity `
    -DiResourceName <your-di-resource-name> `
    -CuEndpoint "https://<your-cu>.cognitiveservices.azure.com/" `
    -CuAuthMode identity `
    -CuResourceName <your-cu-resource-name> `
    -StorageMode blob
```

**パターン 5: CU のみ（キー認証）**

```powershell
./scripts/deploy_aca.ps1 `
    -Location japaneast `
    -ResourceGroupName rg-ragops-studio `
    -AcrName <uniqueacrname> `
    -CuEndpoint "https://<your-cu>.cognitiveservices.azure.com/" `
    -CuKey "<your-cu-key>"
```

**オプション**

| パラメータ | 説明 |
|---|---|
| `-UploadsEnabled $true` | アップロードを有効化 |
| `-StorageAccountName "name"` | ストレージアカウント名を明示指定（未指定なら自動生成） |
| `-StorageShareName "name"` | ファイル共有名（SMB モード、デフォルト: `appstorage`） |
| `-StorageShareQuotaGiB 20` | ファイル共有サイズ（SMB モード、デフォルト: 10 GiB） |
| `-BlobContainerName "name"` | Blob コンテナ名（Blob モード、デフォルト: `appstorage`） |
| `-DiAuthMode key\|identity` | DI 認証モード（デフォルト: `key`） |
| `-DiResourceName "name"` | DI リソース名（identity モード時の RBAC スコープ指定） |
| `-DiResourceGroupName "name"` | DI リソースグループ（デフォルト: `-ResourceGroupName` と同じ） |
| `-CuEndpoint "url"` | CU エンドポイント URL |
| `-CuKey "key"` | CU API キー（key モード） |
| `-CuAuthMode key\|identity` | CU 認証モード（デフォルト: `key`） |
| `-CuResourceName "name"` | CU リソース名（identity モード時の RBAC スコープ指定） |
| `-CuResourceGroupName "name"` | CU リソースグループ（デフォルト: `-ResourceGroupName` と同じ） |

### 更新

同じコマンドをもう一度実行するだけで、ACR イメージを再ビルドし Container App を更新します。

- 更新時は通常エンドポイント/キーの再セット不要です（既存の secret/env を保持）
- キーをローテーションしたい場合は `-DiKey` / `-CuKey` を渡すと secret を更新します
- 認証モードを切り替える場合は `-DiAuthMode` / `-CuAuthMode` を指定してください
