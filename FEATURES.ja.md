# FEATURES – RAGOps Studio for Document Intelligence / Content Understanding

> エンジニア向け機能リファレンス  
> クイックスタートは [README.ja.md](README.ja.md) を参照してください。

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [デュアルサービス対応 (DI / CU)](#2-デュアルサービス対応-di--cu)
3. [Document Intelligence (DI) 解析](#3-document-intelligence-di-解析)
4. [Content Understanding (CU) 解析](#4-content-understanding-cu-解析)
5. [モデル / アナライザーピッカー](#5-モデル--アナライザーピッカー)
6. [PDF ビューア & BBox オーバーレイ](#6-pdf-ビューア--bbox-オーバーレイ)
7. [画像ビューア & BBox オーバーレイ](#7-画像ビューア--bbox-オーバーレイ)
8. [メディアビューア (音声 / 動画)](#8-メディアビューア-音声--動画)
9. [Structure ビューア (2D ツリー)](#9-structure-ビューア-2d-ツリー)
10. [3D Structure ビューア](#10-3d-structure-ビューア)
11. [Markdown / Raw プレビュー](#11-markdown--raw-プレビュー)
12. [結果パネル (Summary / Items / JSON)](#12-結果パネル-summary--items--json)
13. [キャッシュシステム](#13-キャッシュシステム)
14. [ライブラリ (キャッシュブラウザ)](#14-ライブラリ-キャッシュブラウザ)
15. [結果比較 (セマンティック Diff)](#15-結果比較-セマンティック-diff)
16. [ユーザータブ (プラグイン HTML タブ)](#16-ユーザータブ-プラグイン-html-タブ)
17. [ストレージバックエンド](#17-ストレージバックエンド)
18. [認証](#18-認証)
19. [ジョブシステム](#19-ジョブシステム)
20. [i18n (日本語 / 英語)](#20-i18n-日本語--英語)
21. [テーマシステム](#21-テーマシステム)
22. [レスポンシブレイアウト](#22-レスポンシブレイアウト)
23. [セキュリティ](#23-セキュリティ)
24. [デプロイ (Azure Container Apps)](#24-デプロイ-azure-container-apps)
25. [環境変数リファレンス](#25-環境変数リファレンス)
26. [API エンドポイントリファレンス](#26-api-エンドポイントリファレンス)

---

## 1. アーキテクチャ概要

| レイヤー | 技術 | 備考 |
|---|---|---|
| **バックエンド** | Flask 3.0 (Python 3.10+) | 単一プロセス、`create_app()` ファクトリパターン |
| **フロントエンド** | 素の HTML / CSS / JS (ES modules) | ビルドステップ不要。`app.js` + `styles.css` のみ |
| **PDF 描画** | pdf.js v5 (ESM, CDN からロード。ローカル vendor フォールバックあり) | Canvas 描画 + SVG オーバーレイ |
| **Markdown** | marked 12.x + DOMPurify 3.x (CDN) | CU の Markdown コンテンツプレビュー用 |
| **本番サーバー** | Gunicorn (`wsgi.py`) | `gunicorn -w 2 -k gthread --threads 8` |
| **コンテナ** | Docker (`python:3.11-slim`) | デフォルトポート 8000 |

### 主要依存パッケージ (`requirements.txt`)

| パッケージ | バージョン | 用途 |
|---|---|---|
| `flask` | 3.0.3 | Web フレームワーク |
| `python-dotenv` | 1.0.1 | `.env` ファイル読み込み |
| `azure-ai-documentintelligence` | 1.0.2 | DI SDK (v4.0 GA) |
| `azure-ai-contentunderstanding` | ≥1.0.0 | CU SDK (GA 2025-11-01) |
| `azure-identity` | 1.19.0 | `DefaultAzureCredential` |
| `azure-core` | 1.31.0 | Azure SDK コア |
| `azure-storage-blob` | 12.24.1 | Blob Storage バックエンド |
| `gunicorn` | 22.0.0 | 本番 WSGI サーバー |

### ディレクトリ構成

```
app.py                  ← Flask アプリケーションファクトリ
wsgi.py                 ← Gunicorn エントリポイント
src/
  di_service.py         ← DI SDK ラッパー (analyze_document_file / _bytes)
  cu_service.py         ← CU SDK ラッパー (派生アナライザー管理, analyze_content_*)
  storage.py            ← ローカル DocumentStore / JobStore
  blob_storage.py       ← Azure Blob Storage バックエンド
  cache.py              ← ResultCache (ローカルファイルシステム)
static/
  app.js                ← フロントエンド全ロジック (~6500 行)
  styles.css            ← テーマ対応スタイル
  usertab.css           ← ユーザータブプラグインコンテンツ用スタイル
templates/
  index.html            ← 単一ページ Jinja2 テンプレート
usertab/
  en/*.html             ← 英語版ユーザータブプラグイン
  ja/*.html             ← 日本語版ユーザータブプラグイン
scripts/
  deploy_aca.ps1        ← Azure Container Apps デプロイスクリプト
storage/
  uploads/              ← アップロードファイル (ローカルモード)
  results/              ← ジョブ結果 JSON (ローカルモード)
  cache/                ← 解析結果キャッシュ (ローカルモード)
```

---

## 2. デュアルサービス対応 (DI / CU)

本アプリは 2 つの Azure AI サービスを並行サポートします:

| | Document Intelligence (DI) | Content Understanding (CU) |
|---|---|---|
| **SDK** | `azure-ai-documentintelligence` 1.0.2 | `azure-ai-contentunderstanding` ≥1.0.0 |
| **API バージョン** | v4.0 GA | GA 2025-11-01 |
| **組み込みモデル** | 30 種のプリビルトモデル | 47 種のプリビルトアナライザー |
| **カスタムモデル** | モデル ID 手動入力 | 派生アナライザー自動作成 |
| **メディア対応** | PDF, 画像 | PDF, 画像, 音声, 動画, Office 文書 |
| **オプションパネル** | DI 固有の features & パラメータ | 18 種中 16 種の Processing Configuration パラメータ (89%) |

### サービス切り替え

- 左ペインヘッダーの **サービスセレクター** (`[DI] [CU]` トグルボタン) で切り替え。
- `CU_ENDPOINT` 未設定の場合、CU ボタンは無効化（グレーアウト + ツールチップ表示）。
- サービス切り替え時: モデルピッカーの再読み込み、オプションパネルの切り替え、ページタイトルの更新。
- 状態変数: `currentService` (`'di'` | `'cu'`)。

### 条件付き機能有効化

- `is_cu_configured()` が起動時に `CU_ENDPOINT` を確認 → `window.__APP_CONFIG__` に `CU_ENABLED` をセット。
- CU 関連 API エンドポイント (`/api/cu/*`) は CU 未設定時に `503` を返す。

---

## 3. Document Intelligence (DI) 解析

### 対応オプション

| UI コントロール | API 機能 | DI SDK パラメータ |
|---|---|---|
| 高解像度チェックボックス | `ocrHighResolution` | `features=["ocrHighResolution"]` |
| 数式チェックボックス | `formulas` | `features=["formulas"]` |
| バーコードチェックボックス | `barcodes` | `features=["barcodes"]` |
| フォント/スタイルチェックボックス | `styleFont` | `features=["styleFont"]` |
| ページ指定入力 | ページ範囲フィルタ | `pages="1-3,5"` |
| ロケール入力 | OCR 言語ヒント | `locale="ja-JP"` |
| 出力形式ドロップダウン | コンテンツフォーマット | `output_content_format="markdown"` |
| クエリフィールド入力 | アドオンフィールド抽出 | `query_fields=["FieldA","FieldB"]` |

### 解析フロー

1. クライアントが `POST /api/analyze` を `{ documentId, modelId, options }` で送信。
2. バックエンドがキャッシュを確認（ファイル SHA-256 + モデル + オプション SHA-1 署名）。
3. キャッシュミス → `threading.Thread` を起動 → `analyze_document_file()` または `analyze_document_bytes()` を呼び出し。
4. DI SDK: `client.begin_analyze_document(model_id, body, **features)` → 結果をポーリング。
5. 結果を `.to_dict()` / `.as_dict()` で辞書に変換。
6. 結果をキャッシュ + ジョブストアに保存 → クライアントが `GET /api/jobs/<id>` でポーリング。

### カスタムモデル ID

- ピッカーの選択を上書きするカスタムモデル ID（UUID またはモデル名）を入力可能。
- カスタム ID フィールドは DI モード時のみ表示（CU 選択時は非表示）。

---

## 4. Content Understanding (CU) 解析

### 対応 Processing Configuration パラメータ (16/18)

| カテゴリ | パラメータ | UI コントロール | SDK キー |
|---|---|---|---|
| **一般** | Return details | ドロップダウン (bool) | `return_details` |
| | Omit content | ドロップダウン (bool) | `omit_content` |
| | Field source/confidence | ドロップダウン (bool) | `estimate_field_source_and_confidence` |
| **文書抽出** | OCR | ドロップダウン (bool) | `enable_ocr` |
| | Layout | ドロップダウン (bool) | `enable_layout` |
| | Formula | ドロップダウン (bool) | `enable_formula` |
| | Barcode | ドロップダウン (bool) | `enable_barcode` |
| | Figure description | ドロップダウン (bool) | `enable_figure_description` |
| | Figure analysis | ドロップダウン (bool) | `enable_figure_analysis` |
| | Annotations | ドロップダウン (bool) | `enable_annotations` |
| **出力フォーマット** | Table format | ドロップダウン (html/markdown) | `table_format` |
| | Chart format | ドロップダウン (chartJs/markdown) | `chart_format` |
| | Annotation format | ドロップダウン (none/markdown) | `annotation_format` |
| **分類 / セグメンテーション** | Enable segment | ドロップダウン (bool) | `enable_segment` |
| | Segment per page | ドロップダウン (bool) | `segment_per_page` |
| | Content categories | JSON テキストエリア | `content_categories` |

### 追加パラメータ

| パラメータ | UI コントロール | CU API パラメータ |
|---|---|---|
| 解析範囲 | テキスト入力 | `content_range`（リクエストレベル、config ではない） |
| 処理ロケーション | ドロップダウン (global/geography/dataZone) | `processing_location`（リクエストレベル） |

### フィールドスキーマエディター

スキーマが必須のアナライザー（`needsSchema: true`, 例: `prebuilt-image`, `prebuilt-audio`, `prebuilt-video`）向け:

- **テーブルモード**: インタラクティブなテーブルエディタ（フィールド名、型ドロップダウン、説明）。行の動的追加/削除。
- **JSON モード**: 上級者向け JSON テキストエリア。
- 対応フィールド型: `string`, `number`, `integer`, `boolean`, `date`, `time`, `array`, `object`。
- スキーマは options ペイロードの `field_schema` として送信。

### 派生アナライザー自動管理

CU GA (2025-11-01) はリクエスト単位の config オーバーライドをサポートしない。UI オプションがベースアナライザーの config と異なる場合:

1. **`_resolve_analyzer()`** が config kwargs を抽出し、ベースとの差分を確認。
2. **`_get_root_and_config()`** がアナライザー階層を辿り（最大 5 レベル）、ルートの `baseAnalyzerId`、元の config、モデルデプロイメントを取得。
3. **`_derived_analyzer_id()`** が決定論的 ID を生成: `studio.<safe_source>.<sha256_16文字>`。
4. **`_ensure_derived_analyzer()`** が派生アナライザーの存在を確認（ステータスチェック付き）。なければ `client.begin_create_analyzer()` で作成。
5. 結果は `_known_derived_analyzers`（インプロセス set）と `_analyzer_info_cache`（dict）にキャッシュ。
6. スレッドセーフ: `_derived_analyzer_lock` (threading.Lock) を使用。
7. 派生アナライザーが存在するが非 ready ステータスの場合、削除して再作成。

### CU 解析フロー

1. クライアントが `POST /api/cu/analyze` を `{ documentId, analyzerId, options }` で送信。
2. キャッシュキーはバージョンプレフィックス付き: `cu:v8:<analyzerId>__<optionsSig>`。
3. キャッシュミス → スレッド起動 → `analyze_content_file()` / `analyze_content_bytes()` を呼び出し。
4. CU SDK: `client.begin_analyze_binary()`（バイト直渡し）またはファイルベース解析。
5. 結果は `normalizeCuResultForUi()` で UI 向けに正規化。

---

## 5. モデル / アナライザーピッカー

### リッチモデルピッカー UI

- **ドロップダウンボタン** + フィルタ入力による現在の選択ラベル表示。
- **テキスト検索フィルタ**: モデル ID でのリアルタイムフィルタリング。
- **カテゴリグループ**: モデルをカテゴリ別に分類（analysis, financial, identity, tax, mortgage 等）。
- **米国専用トグル**: US 固有のモデル（`us: true`）の表示/非表示チェックボックス。
- **カテゴリラベル** は現在の言語で翻訳。

### DI モデル (30 種のプリビルト)

| カテゴリ | モデル |
|---|---|
| 文書解析 | `prebuilt-read`, `prebuilt-layout`, `prebuilt-document` |
| 金融 | `prebuilt-invoice`, `prebuilt-receipt`, `prebuilt-creditCard`, `prebuilt-bankStatement` (US), `prebuilt-check.us`, `prebuilt-payStub.us`, `prebuilt-contract` |
| 本人確認 | `prebuilt-idDocument`, `prebuilt-healthInsuranceCard.us`, `prebuilt-marriageCertificate.us` |
| 米国税務 | `prebuilt-tax.us`, `prebuilt-tax.us.w2`, `prebuilt-tax.us.w4`, `prebuilt-tax.us.1040` 等（11 モデル） |
| 米国住宅ローン | `prebuilt-mortgage.us.1003`, `prebuilt-mortgage.us.1004`, `prebuilt-mortgage.us.1005`, `prebuilt-mortgage.us.1008`, `prebuilt-mortgage.us.closingDisclosure` |

### CU アナライザー (47 種のプリビルト)

| カテゴリ | アナライザー |
|---|---|
| コンテンツ抽出 | `prebuilt-read`, `prebuilt-layout` |
| ベース | `prebuilt-document`, `prebuilt-image`*, `prebuilt-audio`*, `prebuilt-video`* |
| RAG | `prebuilt-documentSearch`, `prebuilt-imageSearch`*, `prebuilt-audioSearch`*, `prebuilt-videoSearch`* |
| 金融 | `prebuilt-invoice`, `prebuilt-receipt`, `prebuilt-receipt.generic`, `prebuilt-receipt.hotel`, `prebuilt-creditCard`, `prebuilt-creditMemo`, `prebuilt-check.us`, `prebuilt-bankStatement.us` |
| 本人確認 | `prebuilt-idDocument`, `prebuilt-idDocument.generic`, `prebuilt-idDocument.passport`, `prebuilt-healthInsuranceCard.us` |
| 米国税務 | `prebuilt-tax.us`, `prebuilt-tax.us.w2`, `prebuilt-tax.us.w4` 等（11 モデル） |
| 米国住宅ローン | `prebuilt-mortgage.us`, `prebuilt-mortgage.us.1003` 等（6 モデル） |
| 法務・ビジネス | `prebuilt-contract`, `prebuilt-marriageCertificate.us` |
| 調達 | `prebuilt-procurement`, `prebuilt-purchaseOrder` |
| その他 | `prebuilt-payStub.us`, `prebuilt-utilityBill` |
| ユーティリティ | `prebuilt-documentFieldSchema`*, `prebuilt-documentFields`* |

\* _フィールドスキーマ定義が必要_

---

## 6. PDF ビューア & BBox オーバーレイ

### 描画パイプライン

1. **pdf.js v5 ESM** を CDN からロード（オフライン用フォールバック: `static/vendor/pdfjs/`）。
2. PDF を `<canvas>` 要素に描画。
3. SVG `<svg>` オーバーレイを Canvas 上に絶対配置。
4. バウンディングボックス (BBox) を SVG `<path>` 要素としてポリゴン座標から描画。

### BBox オーバーレイモード (10 種)

| モード | CSS クラス | 説明 |
|---|---|---|
| `none` | — | オーバーレイなし |
| `lines` | `bbox--lines` | テキスト行 |
| `words` | `bbox--words` | 個々の単語 |
| `paragraphs` | `bbox--paragraphs` | 段落ブロック |
| `figures` | `bbox--figures` | 図 + キャプション領域 |
| `formulas` | `bbox--formulas` | 数式 |
| `barcodes` | `bbox--barcodes` | バーコード / QR コード |
| `tables` | `bbox--tables` | テーブルセル（ロール表示付き） |
| `keyValuePairs` | `bbox--kv` | キー・バリューペアの領域 |
| `selectionMarks` | `bbox--selection` | チェックボックス / ラジオボタン |

### インタラクション

- **ホバーツールチップ**: 各バウンディングボックスのコンテンツテキスト、ロール、型情報を表示。
- **クリック → JSON ビューア**: BBox をクリックすると Response JSON タブの該当 JSON パスを開く。
- **レスポンシブタッチ**: タップでツールチップ表示、他の場所をタップで消去。
- **ページナビゲーション**: `Prev` / `Next` ボタン + ページドロップダウンセレクター。
- **パフォーマンスガード**: `MAX_OVERLAY_SHAPES = 2500` でブラウザの速度低下を防止。

### 座標系

- DI は `boundingRegions[].polygon` 配列（8 個の float = 4 頂点）を提供。
- 座標はページの単位系（`page.width` × `page.height`）。
- `polygonToPath()` が DI 座標 → Canvas ピクセル座標に変換。

---

## 7. 画像ビューア & BBox オーバーレイ

- PDF 以外の画像ファイル（JPEG, PNG, TIFF 等）は `<img>` 要素として描画。
- PDF ビューアと同じ SVG オーバーレイシステムを使用。`naturalWidth` / `naturalHeight` で座標マッピング。
- 解析結果が到着し、DI レスポンスからページ寸法が取得できた後に BBox を描画。

---

## 8. メディアビューア (音声 / 動画)

- MIME タイプまたはファイル拡張子で音声/動画を検出。
- 音声拡張子: `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.wma`
- 動画拡張子: `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`
- ネイティブ HTML5 `<audio>` または `<video>` 要素をコントロール付きで描画。
- **メディアタブ** はメディアファイル読み込み時にプレビュータブに自動表示。
- 主に CU アナライザー（`prebuilt-audio`, `prebuilt-video` 等）と連携。

---

## 9. Structure ビューア (2D ツリー)

- プレビュー領域の **Structure タブ**。
- 解析結果の `paragraphs` と `sections` のツリービューを表示。
- 各ノードにロールを表示（title, sectionHeading, footnote, pageHeader, pageFooter 等）。
- ドキュメントレイアウトの構造を素早く把握可能。

---

## 10. 3D Structure ビューア

> 🥚 **イースターエッグ**: これは実用機能ではなくジョーク機能です。見た目のインパクトを楽しむものであり、実際の解析ワークフローでは使用しません。

CSS 3D トランスフォームによるインタラクティブな 3D 分解ビュー（WebGL 不使用）。

### コントロール

| コントロール | 機能 |
|---|---|
| **Mode** ボタン | `Current page` / `All pages` |
| **Text** チェックボックス | 要素上のテキストコンテンツの表示/非表示 |
| **Explode** スライダー | 0–80px の要素タイプ間レイヤー間隔 |
| **Zoom** スライダー | 60%–160% のズーム |
| **ドラッグ** | 3D シーンの回転（マウス/タッチ） |
| **スクロールホイール** | ズームイン/アウト |
| **要素クリック** | インスペクターパネルに要素詳細を表示 |

### 要素タイプ

各ドキュメント要素タイプが色付きレイヤーとして描画:

- Lines, Words, Paragraphs, Tables, Key-Value Pairs, Selection Marks, Figures, Formulas, Barcodes, Sections

### フィルタートグル

- 要素タイプごとのトグルボタン（要素数表示付き）。
- 無効化されたタイプは 3D シーンから非表示。
- 状態（mode, explode, zoom, showText, 有効タイプ）は `localStorage` に永続化。

### 実装

- ステージに CSS `perspective`、シーンに `transform: translate3d() / rotateX() / rotateY()`。
- 各要素は DI ページ座標から算出された絶対配置の `<div>`。
- `renderStructure3D()` は結果変更、ページ切り替え、フィルタ変更時にシーンを再構築。

---

## 11. Markdown / Raw プレビュー

- **Markdown タブ**: CU の `contents[].markdown` を `marked.parse()` で描画（サニタイズ済み）。
- **Raw タブ**: 生の Markdown テキストをそのまま表示。
- DI の場合: `output_content_format=markdown` 選択時に有効化。
- CU の場合: いずれかのコンテンツに空でない `markdown` フィールドがある場合に有効化。
- 両タブはマークダウンコンテンツがない場合に `disabled`（グレーアウト）。
- CU 結果にマークダウンが含まれる場合、Markdown タブを自動的にアクティブ化。

---

## 12. 結果パネル (Summary / Items / JSON)

### タブ

| タブ | 内容 |
|---|---|
| **Summary** | モデル ID、API バージョン、コンテンツ長、ページ数、段落/テーブル/図/スタイル数 |
| **Items** | 階層的 `<details>` ツリー: Pages → Lines → Words, Paragraphs, Tables (HTML `<table>` として描画), Key-Value Pairs, Figures, Styles, Documents/Fields。CU: Contents → Fields（信頼度バッジ付き） |
| **Response JSON** | 折りたたみ式 JSON ツリービューア（構文ハイライト付き）。全展開/全折りたたみボタン。JSON ダウンロードボタン |
| **Request JSON** | API に送信されたリクエストペイロードを表示。デバッグや呼び出し再現に有用 |

### CU 固有の Items ビュー

- CU 結果では、各 `contents[]` エントリが折りたたみ式セクションとして表示。
- メタデータ: kind, path, MIME タイプ, ページ範囲, Markdown 長, フィールド数。
- フィールドは名前、値、**信頼度バッジ**（色分け: ≥80% 緑, ≥50% 黄, <50% 赤）で表示。
- フィールドクリックで JSON ビューアの該当パスを開く。

### JSON ビューア

- 結果オブジェクトから構築される再帰的な折りたたみ式ツリー。
- Array/Object ノードはアイテム数を表示。
- 文字列、数値、真偽値、null を色分け。
- 長い文字列は省略表示（ホバーで `title` に全文表示）。
- `openJsonViewerPath(path)` でディープパスをプログラム的に開く（BBox クリックやフィールドクリックで使用）。

---

## 13. キャッシュシステム

### 設計

- **目的**: 同一ファイル + モデル + オプション組み合わせでの冗長な API 呼び出しを回避。
- **キャッシュキー**: `SHA-256(ファイル内容)` → ディレクトリ、`base64url(model_id)` → ファイル名。
- **オプション署名**: `SHA-1(json(ソートされたオプション))` を model_id に `model_id__sig` として付加。
- **CU バージョンプレフィックス**: `cu:v8:<analyzer_id>` — SDK レスポンス形式変更時にバージョンアップ。

### ローカルキャッシュ (`cache.py` の `ResultCache`)

```
storage/cache/
  <file_hash_hex>/
    <base64url_model_id>.json
    <base64url_model_id__sig>.json
```

- `has()` / `load()` / `save()` — シンプルな JSON ファイル読み書き。
- `list_file_hashes()` — ディレクトリスキャン。
- `list_variants()` — 構造化メタデータ (label, key, savedAt, optionKeys) を各 JSON の `_meta` から読み取り。
- `load_by_key()` — file_hash + encoded key で読み込み（パストラバーサル安全性の検証付き）。
- `delete_file_hash()` — `shutil.rmtree` でハッシュディレクトリ全体を削除。
- `cache_count()` — ハッシュごとの JSON ファイル数をカウント。

### Blob キャッシュ (`blob_storage.py` の `BlobResultCache`)

- 同一インターフェース。`cache/{file_hash}/{encoded_model_id}.json` に Azure Blob Storage で保存。
- `DefaultAzureCredential` を使用 — ストレージアカウントキー不要。

### メタデータ埋め込み

各キャッシュ結果に `_meta` が付加:

```json
{
  "_meta": {
    "savedAt": "2026-03-18T16:39:16+00:00",
    "options": { "enable_ocr": true, "table_format": "html" }
  }
}
```

---

## 14. ライブラリ (キャッシュブラウザ)

### UI

- 左ペインの入力ペイン内の **キャッシュタブ**。
- キャッシュ済みファイルの**カードリスト**を表示 — 各カードにファイル名、コンテンツタイプ、ファイルサイズ、ファイルハッシュ。
- 各カードを展開すると**バリアント**（同一ファイルに対する異なるモデル/オプション組み合わせのキャッシュ）を表示。
- バリアントエントリ: サービスラベル (`[DI]`/`[CU]`)、モデル名、`(+options)` インジケータ、保存タイムスタンプ、オプションキー。
- **ロードボタン**: API 再呼び出しなしでキャッシュ結果を即座にロード。
- **削除ボタン**: そのハッシュの全キャッシュエントリ + アップロードファイルを削除。
- **チェックボックス**: 比較モード用のバリアント選択。

### バックエンド API

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `GET /api/library` | GET | 全キャッシュ済みファイルとバリアントの一覧 |
| `POST /api/library/refresh` | POST | アップロードディレクトリの再スキャン |
| `DELETE /api/library/<file_hash>` | DELETE | ハッシュのキャッシュ + アップロードファイル削除 |
| `GET /api/library/<file_hash>/cache/<encoded_key>` | GET | 特定のキャッシュ結果を取得 |
| `POST /api/cache/exists` | POST | file_hash + model + options でキャッシュ存在確認 |

### ライブラリ更新

- `POST /api/library/refresh` が `document_store.refresh_from_disk()` を呼び出し。
- アップロードディレクトリの `{uuid}__{filename}` パターンに一致するファイルをスキャン。
- `storage/uploads/` ディレクトリに直接配置されたファイルの検出に有用。

---

## 15. 結果比較 (セマンティック Diff)

### 仕組み

1. ライブラリからチェックボックスで 2 つ以上のバリアントを選択。
2. **比較** ボタンをクリック。
3. バックエンドが各キャッシュ結果 JSON を取得。
4. フロントエンドが **セマンティック Diff** を実行:
   - 各 JSON を `Map<ドットパス, 値>` に `flattenJson()` で展開。
   - 全結果のユニークパスを収集。
   - 差分を特定: いずれか 2 結果間で値が異なるパス。
5. **比較テーブル** を描画:
   - 行 = JSON パス（階層的にインデント）。
   - 列 = 選択された結果。
   - セルの色分け: `added`（緑）, `removed`（赤）, `changed`（黄）, `unchanged`。

### コントロール

| ボタン | アクション |
|---|---|
| **すべて展開** | 全折りたたみ可能なコンテナ行を展開 |
| **すべて折りたたむ** | 全コンテナ行を折りたたむ |
| **差分のみ** | 差分のある行のみ表示をトグル |
| **比較を閉じる** | 比較オーバーレイを非表示 |

### 統計

表示: 総パス数、差分パス数、一致パス数。

---

## 16. ユーザータブ (プラグイン HTML タブ)

### メカニズム

1. `usertab/<lang>/` に `.html` ファイルを配置（例: `usertab/en/my-tab.html`, `usertab/ja/my-tab.html`）。
2. ロード時に `GET /api/usertabs?lang=<lang>` で利用可能なタブ一覧を取得。
3. 各タブの HTML が `GET /api/usertabs/<name>?lang=<lang>` で取得される。
4. HTML は **DOMPurify でサニタイズ**（厳格な許可リスト: `<script>`, `<iframe>`, `<form>`, `<input>` 等なし、`on*` イベント属性なし）。
5. 右結果パネルの組み込みタブの後にタブが表示。

### タブタイトル

- HTML ファイルの先頭 256 バイト内に `<!-- tab-title: カスタムタブ名 -->` を記述。
- 未記述の場合、ファイル名のステム部分がタイトルとして使用。

### 言語フォールバック

- 言語固有ディレクトリ: `usertab/<lang>/`。
- 要求された言語ディレクトリが存在しない場合、`usertab/en/` にフォールバック。

### 組み込みユーザータブ

> **注意**: ユーザータブは**デモ専用機能**です。同梱されているタブはいずれも、業務シナリオにおける AI エージェントの実行結果を静的 HTML で模擬表示するモックであり、実際のエージェント呼び出しや動的処理は行いません。業務 Agent がドキュメント解析結果をどのように活用し、どのような出力を返すかの「見え方」を確認するためのサンプルです。

| タブ | ファイル | 説明 |
|---|---|---|
| Character Validation | `char-validation.html` | 文字バリデーションエージェントの実行結果モック |
| FSA Risk Assessment | `fsa-risk-assessment.html` | 金融庁リスク判定エージェントの実行結果モック |
| Legal Clause Check | `legal-clause-check.html` | 法的条項チェックエージェントの実行結果モック |

### データアクセス API

ユーザータブは `window.__USERTAB_API__` 経由で結果データにアクセス可能（メインアプリが公開）。将来的なエージェント連携のプロトタイプ用途にも利用できます。

### セキュリティ

- パストラバーサル防止: name に `/`, `\`, `..` を含めることはできない。
- 解決されたパスが `USERTAB_DIR` 配下であることを検証。
- DOMPurify の厳格な設定で HTML をサニタイズ。

---

## 17. ストレージバックエンド

### ローカルモード (デフォルト)

```
STORAGE_BACKEND=local
```

| ストア | ディレクトリ | フォーマット |
|---|---|---|
| `DocumentStore` | `storage/uploads/` | `{uuid}__{secure_filename}` + `index.json` |
| `JobStore` | `storage/results/` | `{job_id}.json` |
| `ResultCache` | `storage/cache/` | `{file_hash}/{base64_model}.json` |

- インデックスファイル (`index.json`) がドキュメントメタデータを追跡（高速ルックアップ用）。
- アトミックインデックス書き込み: `tmp → rename` で破損を防止。
- `refresh_from_disk()`: アップロードディレクトリを再スキャンして外部追加ファイルを検出。
- ファイルハッシュは SHA-256（1MB チャンク）で計算。

### Blob モード

```
STORAGE_BACKEND=blob
AZURE_STORAGE_ACCOUNT_NAME=<account>
AZURE_STORAGE_CONTAINER_NAME=appstorage    # デフォルト
```

| ストア | Blob プレフィックス | フォーマット |
|---|---|---|
| `BlobDocumentStore` | `uploads/` | `uploads/{uuid}__{filename}` + `uploads/index.json` |
| `BlobJobStore` | `results/` | `results/{job_id}.json` |
| `BlobResultCache` | `cache/` | `cache/{file_hash}/{base64_model}.json` |

- `DefaultAzureCredential`（マネージド ID / Entra ID）を使用 — **ストレージアカウントキー不要**。
- コンテナが存在しない場合は自動作成。
- `threading.Lock` によるインデックス操作のスレッドセーフティ。
- `index.json` が欠損時のスキャンベースリカバリ。

### インターフェース互換性

`DocumentStore` / `BlobDocumentStore` は同じ公開 API を共有:
- `save_upload(file)`, `get(document_id)`, `get_content(document_id)`, `list_documents()`, `find_by_hash(file_hash)`, `delete(document_id)`, `refresh_from_disk()`。

`JobStore` / `BlobJobStore` および `ResultCache` / `BlobResultCache` も同様。

---

## 18. 認証

### DI 認証 (`DI_AUTH_MODE`)

| モード | 環境変数値 | 挙動 |
|---|---|---|
| **Auto** (デフォルト) | `auto` | `DI_KEY` があればキー認証、なければ `DefaultAzureCredential` |
| **Key** | `key` | `DI_KEY` が必要 |
| **Identity** | `identity` | `DefaultAzureCredential` を使用（キー不要） |

### CU 認証 (`CU_AUTH_MODE`)

| モード | 環境変数値 | 挙動 |
|---|---|---|
| **Auto** (デフォルト) | `auto` | `CU_KEY` があればキー認証、なければ `DefaultAzureCredential` |
| **Key** | `key` | `CU_KEY` が必要 |
| **Identity** | `identity` | `DefaultAzureCredential` を使用（キー不要） |

### Blob ストレージ認証

- 常に `DefaultAzureCredential` を使用 — ストレージアカウントキーは一切不要。
- `Storage Blob Data Contributor` ロールの割り当てが必要。

### 実装

- `_get_auth_mode()` が環境変数を読み取り・検証。
- `_build_credential()` が `(endpoint, credential)` タプルを返却。
- `_get_default_azure_credential()` が `azure-identity` 未インストール時に明確なエラーを提供。

---

## 19. ジョブシステム

### ジョブライフサイクル

```
queued → running → succeeded / failed
```

### ジョブストア (インメモリ + ファイルシステム/Blob)

- ジョブメタデータはインメモリ保存（`dict` + `threading.Lock`）。
- 結果 JSON はファイルシステム（ローカル）または Blob ストレージ（Blob モード）に永続化。
- 各ジョブの属性: `id`, `documentId`, `modelId`, `status`, `error`, `createdAt`, `updatedAt`。
- タイムスタンプは Unix ミリ秒（`int(time.time() * 1000)`）。

### クライアント側ポーリング

- `POST /api/analyze` または `POST /api/cu/analyze` 後、クライアントは `{ job: { id, cacheHit } }` を受信。
- `cacheHit=true` の場合: 結果は即座に利用可能。
- それ以外: クライアントが `GET /api/jobs/<id>` を間隔を空けてポーリングし、`succeeded` または `failed` になるまで待機。
- 成功時: `GET /api/jobs/<id>/result` で結果を取得。

### バックグラウンドスレッド

- 解析は `threading.Thread(target=_run_job, daemon=True)` で実行。
- デーモンスレッドによりプロセスのクリーンなシャットダウンを保証。

---

## 20. i18n (日本語 / 英語)

### 実装

- **クライアント側のみ**: 言語切替にサーバーラウンドトリップ不要。
- 翻訳辞書: `app.js` の `I18N` オブジェクト（`ja` と `en` キー）。
- 約 500 の翻訳キー（全 UI ラベル、ステータス、ツールチップ、エラーメッセージをカバー）。
- `tr(key, vars)` 関数（`{name}` プレースホルダーによる変数補間）。

### DOM 翻訳

- `data-i18n="key"` タグ付き要素 → `textContent` を更新。
- `data-i18n-placeholder="key"` タグ付き要素 → `placeholder` を更新。
- `data-i18n-aria-label="key"` タグ付き要素 → `aria-label` を更新。
- `data-i18n-title="key"` タグ付き要素 → `title` を更新。
- `applyTranslationsToDom()` を言語変更時に呼び出し。

### 言語選択優先順位

1. `localStorage` の保存済みプリファレンス（`diLang`）。
2. サーバー側デフォルト（`UI_DEFAULT_LANG` 環境変数 → `window.__APP_CONFIG__.defaultLang`）。
3. フォールバック: `ja`。

### モデルラベル

- `MODEL_LABELS` オブジェクトが各モデル ID の人間が読める名前を両言語で提供。
- 例: `'prebuilt-invoice': { ja: '請求書', en: 'Invoice' }`。

---

## 21. テーマシステム

### 利用可能なテーマ (5 種)

| テーマ ID | 名前 |
|---|---|
| `dark` | Dark (デフォルト) |
| `light` | Light |
| `midnight` | Midnight |
| `forest` | Forest |
| `solarized` | Solarized |

### 実装

- CSS カスタムプロパティで各テーマの全色を定義。
- `document.body.dataset.theme` 属性が CSS セレクターを駆動。
- テーマ選択は `localStorage` (`diTheme`) に永続化。
- ヘッダーのテーマメニュードロップダウン（翻訳済みラベル）。

---

## 22. レスポンシブレイアウト

### デスクトップ (≥1025px)

- **3 ペインレイアウト**: 左 (入力/モデル) | 中央 (プレビュー) | 右 (結果)。
- **リサイズ可能スプリッター**: ペイン間のドラッグリサイズ。
- ペイン幅は `localStorage` (`diPaneWidths`) に保存。
- 制約: 左最小 240px, 中央最小 320px, 右最小 320px, 左最大 700px, 右最大 900px。

### モバイル (≤1024px)

- **タブレイアウト**: 3 タブ (入力, プレビュー, 結果) — 一度に 1 つのみ表示。
- タブ選択は `localStorage` (`diMainTab`) に保存。
- スプリッター非表示。
- `main--tabbed` CSS クラスを適用。

### 入力ペインサブタブ

- **入力タブ**: ファイルアップロード + モデルピッカー + オプション。
- **キャッシュタブ**: キャッシュブラウザ。
- サブタブ選択は `localStorage` (`diInputPaneTab`) に永続化。

---

## 23. セキュリティ

### Content Security Policy (CSP)

`@app.after_request` で適用:

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

- **CSP nonce**: リクエストごとに `secrets.token_urlsafe(32)` で生成、インライン `<script>` タグに注入。

### 追加セキュリティヘッダー

| ヘッダー | 値 |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |

### アップロード安全策

- アップロードはデフォルトで無効 (`UPLOADS_ENABLED=false`)。
- `werkzeug.utils.secure_filename()` を全ファイル名に使用。
- アップロードファイルは `{uuid}__{secure_filename}` として保存 — UUID で名前衝突を防止。

### パストラバーサル防止

- キャッシュの file_hash をサニタイズ: `re.sub(r"[^a-fA-F0-9]", "", file_hash)[:64]`。
- ユーザータブ名を検証: `/`, `\`, `..` 禁止、解決パスが `USERTAB_DIR` 配下であることを確認。
- キャッシュの encoded_key を検証: `re.fullmatch(r"[A-Za-z0-9_-]+", encoded_key)`。

### ユーザータブのサニタイゼーション

- DOMPurify の厳格な許可リスト。
- 明示的に禁止: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, 全 `<input>` 系, `<meta>`, `<link>`, `<base>`。
- 明示的に禁止される属性: 全 `on*` イベントハンドラ。

---

## 24. デプロイ (Azure Container Apps)

### デプロイスクリプト (`scripts/deploy_aca.ps1`)

デプロイの全自動化 PowerShell スクリプト:

1. **リソースグループ** 作成（存在しない場合）。
2. **Azure Container Registry (ACR)** 作成 + Docker ビルド + プッシュ。
3. **Log Analytics Workspace** 作成。
4. **Container Apps Environment** 作成。
5. **ストレージセットアップ** (SMB または Blob モード)。
6. **ID セットアップ**（マネージド ID 認証使用時）。
7. **Container App** の作成または更新。

### ストレージモード

| モード | 方式 | 認証 |
|---|---|---|
| **SMB** (デフォルト) | Azure Files ボリュームマウント (`/app/storage`) | ストレージアカウントキー (SMB の制約) |
| **Blob** | Blob SDK 直接 R/W | マネージド ID (`DefaultAzureCredential`) |

### 認証モード (サービスごと)

| モード | 方式 | デプロイ設定 |
|---|---|---|
| **Key** (デフォルト) | Container Apps の secret として API キー | `-DiAuthMode key` / `-CuAuthMode key` |
| **Identity** | システム割り当て MI + `Cognitive Services User` ロール | `-DiAuthMode identity` / `-CuAuthMode identity` |

### デプロイパターン

- **DI のみ + key + SMB**: 最もシンプルなセットアップ。
- **DI のみ + identity + blob**: 完全キーレス。
- **DI + CU**: 両サービス、任意の認証組み合わせ。
- **CU のみ**: Content Understanding のみ。

### コンテナ設定

- ベースイメージ: `python:3.11-slim`
- サーバー: `gunicorn -w 2 -k gthread --threads 8`
- デフォルトポート: `8000`

---

## 25. 環境変数リファレンス

| 変数 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `DI_ENDPOINT` | はい* | — | Document Intelligence エンドポイント URL |
| `DI_KEY` | 条件付き | — | DI API キー（key/auto モード時に必要） |
| `DI_AUTH_MODE` | いいえ | `auto` | `key` / `identity` / `auto` |
| `CU_ENDPOINT` | はい* | — | Content Understanding エンドポイント URL |
| `CU_KEY` | 条件付き | — | CU API キー（key/auto モード時に必要） |
| `CU_AUTH_MODE` | いいえ | `auto` | `key` / `identity` / `auto` |
| `STORAGE_BACKEND` | いいえ | `local` | `local` / `blob` |
| `AZURE_STORAGE_ACCOUNT_NAME` | 条件付き | — | Blob モード時に必要 |
| `AZURE_STORAGE_CONTAINER_NAME` | いいえ | `appstorage` | Blob コンテナ名 |
| `UPLOADS_ENABLED` | いいえ | `false` | ファイルアップロードの有効化（`true`/`false`） |
| `UI_DEFAULT_LANG` | いいえ | `ja` | デフォルト UI 言語（`ja`/`en`） |
| `HOST` | いいえ | `0.0.0.0` | Flask バインドホスト |
| `PORT` | いいえ | `5000` (dev) / `8000` (container) | Flask バインドポート |

\* DI_ENDPOINT と CU_ENDPOINT のうち少なくとも 1 つの設定が必要。

---

## 26. API エンドポイントリファレンス

### ヘルスチェック

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/health` | ヘルスチェック (`{"ok": true}`) |

### Document Intelligence

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/models` | DI プリビルトモデル一覧（30 モデル + カテゴリ） |
| `POST` | `/api/analyze` | DI 解析ジョブ開始。Body: `{documentId, modelId, options}` |

### Content Understanding

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/cu/models` | CU プリビルトアナライザー一覧（47 アナライザー + カテゴリ） |
| `POST` | `/api/cu/analyze` | CU 解析ジョブ開始。Body: `{documentId, analyzerId, options}` |

### ジョブ

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/jobs/<job_id>` | ジョブステータス取得 |
| `GET` | `/api/jobs/<job_id>/result` | ジョブ結果取得（`succeeded` 時のみ） |

### ドキュメント

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/documents` | ドキュメントアップロード（multipart `file` フィールド） |
| `GET` | `/files/<document_id>` | ドキュメントのダウンロード/配信 |

### ライブラリ & キャッシュ

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/library` | キャッシュ済みファイルとバリアントの一覧 |
| `POST` | `/api/library/refresh` | アップロードディレクトリの再スキャン |
| `DELETE` | `/api/library/<file_hash>` | ハッシュのキャッシュ + ドキュメント削除 |
| `GET` | `/api/library/<file_hash>/cache/<encoded_key>` | 特定のキャッシュ結果を取得 |
| `POST` | `/api/cache/exists` | キャッシュ存在確認。Body: `{fileHash, modelId, options}` |

### ユーザータブ

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/usertabs?lang=<lang>` | 利用可能なユーザータブ一覧 |
| `GET` | `/api/usertabs/<name>?lang=<lang>` | ユーザータブ HTML コンテンツ取得 |

### 静的ファイル & ページ

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/` | メイン SPA ページ |
| `GET` | `/static/*` | 静的アセット (JS, CSS) |
