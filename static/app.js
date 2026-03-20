let currentDocument = null;
let currentJobId = null;
let currentResult = null;
let currentJsonResult = null;
let currentRequestPayload = null;
let currentModelId = null;
let currentOutputContentFormat = '';
let currentService = 'di'; // 'di' | 'cu'
let uploadActionMode = 'upload'; // 'upload' | 'analyze'
let hasPendingLocalFile = false;

let pdfDoc = null;
let currentPageNumber = 1;
let overlayMode = 'lines';

// Uploads are controlled by server-side env var and injected into the page.
const UPLOADS_ENABLED = !!(window.__APP_CONFIG__ && window.__APP_CONFIG__.uploadsEnabled);
const CU_ENABLED = !!(window.__APP_CONFIG__ && window.__APP_CONFIG__.cuEnabled);

const MAX_LIST = 50;
const MAX_OVERLAY_SHAPES = 2500;

const THEME_STORAGE_KEY = 'diTheme';
const THEMES = [
  { id: 'dark', key: 'theme.dark' },
  { id: 'light', key: 'theme.light' },
  { id: 'midnight', key: 'theme.midnight' },
  { id: 'forest', key: 'theme.forest' },
  { id: 'solarized', key: 'theme.solarized' },
];
const DEFAULT_THEME = 'dark';

const LANG_STORAGE_KEY = 'diLang';
const SUPPORTED_LANGS = [
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
];

const I18N = {
  ja: {
    'app.title.di': 'RAGOps Studio for Document Intelligence',
    'app.title.cu': 'RAGOps Studio for Content Understanding',

    'status.ready': '準備完了',
    'status.readyPreviewOk': '準備完了（プレビューOK）',
    'status.readyPreviewFailed': '準備完了（プレビュー失敗）',
    'status.uploadDisabled': 'アップロードは無効です',
    'status.readyToUpload': 'アップロード準備完了',
    'status.uploading': 'アップロード中…',
    'status.uploadFailed': 'アップロード失敗',
    'status.analyzingQueued': '解析中（キュー）…',
    'status.analyzing': '解析中…',
    'status.analyzingWithStatus': '解析中（{status}）…',
    'status.analyzeFailed': '解析失敗',
    'status.jobLookupFailed': 'ジョブ取得失敗',
    'status.failed': '失敗',
    'status.resultFetchFailed': '結果取得失敗',
    'status.succeeded': '成功',
    'status.errorProcessingResult': '結果の処理でエラー',
    'status.timeout': 'タイムアウト',
    'status.cacheReloadInProgress': 'キャッシュ再読み込み中…',
    'status.cacheReloaded': 'キャッシュを再読み込みしました{suffix}',
    'status.cacheReloadFailed': 'キャッシュ再読み込み失敗',
    'status.initFailed': '初期化に失敗しました',

    'header.language': '言語',
    'header.theme': 'テーマ',

    'main.tabs.aria': 'メイン表示',
    'main.tabs.input': '入力 / モデル',
    'main.tabs.preview': 'プレビュー',
    'main.tabs.results': '結果',

    'pane.input.aria': '入力 / モデル',
    'pane.input.title': '入力 / モデル',
    'pane.preview.aria': 'プレビュー',
    'pane.preview.title': 'プレビュー',
    'pane.results.aria': '結果',
    'pane.results.title': '結果',

    'results.tabs.summary': '概要',
    'results.tabs.items': '項目',
    'results.tabs.json': 'Response JSON',
    'results.tabs.requestJson': 'Request JSON',

    'action.analyze': '解析',
    'action.upload': 'アップロード',
    'action.downloadJson': 'JSONをダウンロード',
    'action.expandAll': 'すべて展開',
    'action.collapseAll': 'すべて折りたたむ',

    'input.tabs.aria': '入力ペイン切り替え',
    'input.tabs.work': '入力',
    'input.tabs.library': 'キャッシュ',

    'field.file': 'ファイル',
    'field.model': 'モデル',
    'field.customModelId': 'カスタムモデルID（任意）',
    'field.customModelId.placeholder': '例: 01234567-.... または my-model',
    'field.analysisOptions': '解析オプション',
    'field.cuOptions': 'CU 実行 / 文書設定',
    'field.cuRequestOptions': '実行オプション',
    'field.cuGeneralOptions': '一般',
    'field.cuDocumentOptions': '文書抽出',
    'field.cuFormatOptions': '出力フォーマット',
    'field.cuSegmentationOptions': '分類 / 分割',
    'field.cuReturnDetails': '詳細結果',
    'field.cuOmitContent': '元コンテンツを省略',
    'field.cuEstimateFieldSource': 'Field source / confidence',
    'field.cuEnableOcr': 'OCR',
    'field.cuEnableLayout': 'Layout',
    'field.cuEnableFormula': 'Formula',
    'field.cuEnableBarcode': 'Barcode',
    'field.cuEnableFigureDescription': 'Figure description',
    'field.cuEnableFigureAnalysis': 'Figure analysis',
    'field.cuEnableAnnotations': 'Annotations',
    'field.cuTableFormat': 'Table format',
    'field.cuChartFormat': 'Chart format',
    'field.cuAnnotationFormat': 'Annotation format',
    'field.cuEnableSegment': 'Enable segment',
    'field.cuSegmentPerPage': 'Segment per page',
    'field.cuContentCategories': 'Content categories (JSON)',
    'field.cuContentCategories.placeholder': '{"invoice":{"description":"請求書ページ","analyzerId":"prebuilt-invoice"},"other":{"description":"その他のページ"}}',
    'field.cuBoolean.default': '(service 既定)',
    'field.cuBoolean.true': '有効 (true)',
    'field.cuBoolean.false': '無効 (false)',
    'field.pages': 'ページ',
    'field.pages.placeholder': '例: 1-3,5',
    'field.locale': 'ロケール',
    'field.locale.placeholder': '例: ja-JP',
    'field.contentRange': '解析範囲',
    'field.contentRange.placeholder': '例: 1-3,5 または 0-30000',
    'field.processingLocation': '処理ロケーション',
    'field.processingLocation.default': '(既定)',
    'tooltip.diHighRes': 'デフォルト: 無効。小さな文字や大判ドキュメント向けに、より高い解像度で OCR を実行します。A1/A2/A3 図面や細かい文字の抽出精度を上げたいときに使います。',
    'tooltip.diFormulas': 'デフォルト: 無効。数式を検出し、数式コレクションとして返します。数式は LaTeX 表現と位置情報を含みます。',
    'tooltip.diBarcodes': 'デフォルト: 無効。バーコードや QR コードを検出し、値や種別を返します。配送ラベルや在庫系文書に向きます。',
    'tooltip.diStyleFont': 'デフォルト: 無効。フォントや文字スタイルの認識を有効にします。強調、スタイル差分、文字装飾を扱いたい場合に使います。',
    'tooltip.diPages': 'デフォルト: 未指定時は全ページ。1 始まりのページ番号または範囲を指定します。例: 1-3,5,7-9。大きな PDF を部分解析したいときに使います。',
    'tooltip.diLocale': 'デフォルト: 自動判定。文字認識と文書解析のロケールヒントです。en や fr、または en-US のような BCP 47 タグを指定できます。確信がある場合だけ指定してください。',
    'tooltip.diOutputContentFormat': 'デフォルト: text。トップレベル content の形式を指定します。markdown は文書構造を保った出力で、主に layout モデルと RAG/LLM 向けに有効です。',
    'tooltip.diQueryFields': 'デフォルト: なし。追加で抽出したいフィールド名を指定します。queryFields add-on を有効化したうえで使い、最大 20 件まで指定できます。既存モデルのスキーマ補完に向きます。',
    'tooltip.cuContentRange': 'デフォルト: 入力全体。解析対象の範囲です。文書では 1 始まりのページ番号、音声・動画ではミリ秒を使い、1-3,5,9- のように複数範囲を指定できます。',
    'tooltip.cuProcessingLocation': 'デフォルト: global。データをどの地域区分で処理してよいかを指定します。global、geography、dataZone から選び、データ所在地要件や性能要件に合わせて制御します。',
    'tooltip.cuReturnDetails': 'デフォルト: false（analyzer により異なる場合あり）。信頼度、バウンディングボックス、テキスト span、メタデータなどの詳細情報を返します。検証やデバッグには有効ですが、レスポンスは大きくなります。',
    'tooltip.cuOmitContent': 'デフォルト: false。この analyzer 自身の content オブジェクトを結果から省略します。contentCategories と組み合わせると、振り分け先 analyzer の結果だけを返したいときに使います。',
    'tooltip.cuEstimateFieldSource': 'デフォルト: false（analyzer により異なる場合あり）。各抽出フィールドについて、元位置と confidence を返します。検証、根拠表示、UI でのハイライトに向きます。',
    'tooltip.cuEnableOcr': 'デフォルト: true。画像やスキャン文書から文字を抽出します。スキャン PDF や画像では有効、ネイティブ PDF だけなら無効化で性能改善が見込めます。',
    'tooltip.cuEnableLayout': 'デフォルト: true。段落、行、単語、読み順、構造要素などのレイアウト情報を抽出します。文書構造を使う処理に必要です。',
    'tooltip.cuEnableFormula': 'デフォルト: true。数式や方程式を検出し、LaTeX 形式で抽出します。論文や技術文書向けです。',
    'tooltip.cuEnableBarcode': 'デフォルト: true。バーコードや QR コードを検出し、デコード済みの値を返します。配送ラベルや在庫文書に向きます。',
    'tooltip.cuEnableFigureDescription': 'デフォルト: false。図表、画像、イラストに自然言語の説明を生成します。アクセシビリティや図の要約に使います。',
    'tooltip.cuEnableFigureAnalysis': 'デフォルト: false。図やチャートをより深く解析し、チャートデータや図の構成要素を抽出します。複雑な図の理解や再利用に向きます。',
    'tooltip.cuEnableAnnotations': 'デフォルト: 明示的に有効化しない限り注釈は返されません。デジタル PDF の注釈要素を抽出し、ハイライト、下線、取り消し線、コメントなどを本文と関連付けて返します。詳細な注釈には returnDetails も必要です。',
    'tooltip.cuTableFormat': 'デフォルト: html。抽出した表をどの形式で Markdown に表現するかを指定します。html は複雑な表の保持向け、markdown はテキスト処理向けです。',
    'tooltip.cuChartFormat': 'デフォルト: chartJs。抽出したチャートをどの形式で表現するかを指定します。chartJs は Chart.js と互換で、再描画や構造化利用に向きます。markdown はテキスト中心の処理向けです。',
    'tooltip.cuAnnotationFormat': 'デフォルト: markdown。注釈を Markdown にどう表現するかを指定します。none は Markdown に注釈を出さず、markdown はネイティブ記法で表現します。',
    'tooltip.cuEnableSegment': 'デフォルト: false。contentCategories に基づいて内容を論理的なセグメントへ分割し、カテゴリ分類します。混在文書を部分ごとに振り分けたいときに使います。',
    'tooltip.cuSegmentPerPage': 'デフォルト: false。セグメンテーション時に論理境界ではなく 1 ページ 1 セグメントへ強制します。ページ単位の並列処理や混在 PDF の切り分け向けです。',
    'tooltip.cuContentCategories': 'デフォルト: 未設定。分類に使うカテゴリ定義の JSON です。各カテゴリは description を必須とし、必要なら analyzerId で振り分け先 analyzer を指定できます。enableSegment=true なら分割と分類、false ならファイル全体を 1 カテゴリに分類します。',
    'common.defaultOption': '(既定)',
    'field.outputContentFormat': '出力フォーマット',
    'field.outputContentFormat.default': '(既定)',
    'field.queryFields': 'クエリフィールド',
    'field.queryFields.placeholder': 'FieldA,FieldB',
    'field.job': 'ジョブ',
    'field.option.highRes': '高解像度 (ocrHighResolution)',
    'field.option.formulas': '数式 (formulas)',
    'field.option.barcodes': 'バーコード / QR (barcodes)',
    'field.option.styleFont': 'フォント / スタイル (styleFont)',

    'hint.customModelOverride': 'カスタムモデルIDは下で上書きできます',
    'hint.analysisOptions': '未指定ならサービス既定値を利用します。大文字小文字はそのまま送ります。',
    'hint.cuOptions': '未指定の項目は analyzer の既定値を使います。いずれかの文書設定を指定した場合は inline analyze body で runtime config を送信します。',
    'hint.cuContentCategories': 'カテゴリ名をキーにした JSON object を指定します。description は推論用プロンプトとして使われ、analyzerId は任意です。',
    'hint.selectFileAndUpload': 'ファイルを選択して「アップロード」を押してください',
    'hint.uploadDisabledUseCache': 'アップロードは一時的に無効化されています（キャッシュ済みファイルをご利用ください）',

    'dropzone.aria': 'ファイルを選択',
    'dropzone.input.aria': 'ファイル選択',
    'dropzone.title': 'ファイルをドロップまたはクリック',
    'dropzone.hint': 'PDF / 画像を選択してください',

    'library.title': 'キャッシュ済みファイル',
    'library.hint': 'サーバが保持しているキャッシュからロードします',
    'library.refresh': '/app/storage から再読み込み',
    'library.loading': '読み込み中…',
    'library.none': 'キャッシュ済みファイルはまだありません',
    'library.models': 'モデル',
    'library.loadVariant': 'クリックでキャッシュ結果をロード',
    'library.loadingVariant': 'キャッシュ結果をロード中…',
    'library.variantLoadFailed': 'キャッシュ結果のロードに失敗しました',
    'library.failedToLoad': '読み込みに失敗しました',
    'library.delete': '削除',
    'library.deleteConfirm': '「{name}」のキャッシュとファイルを削除しますか？',
    'library.deleted': '削除しました（キャッシュ: {caches}件, ファイル: {docs}件）',
    'library.deleteFailed': '削除に失敗しました',
    'library.tabLoadFailed': 'タブの読み込みに失敗しました',

    'splitter.left': '入力/モデルとプレビューの幅調整',
    'splitter.right': 'プレビューと結果の幅調整',

    'preview.tabs.document': 'ドキュメント',
    'preview.tabs.structure': '構造',
    'preview.tabs.structure3d': '3D 構造',
    'preview.tabs.markdown': 'Markdown',
    'preview.tabs.raw': 'Raw',
    'preview.prev': '前へ',
    'preview.next': '次へ',
    'preview.page': 'ページ {n}',
    'preview.bbox': 'BBox',
    'preview.hint': 'アップロード後に表示します（PDFはPDF.js描画＋BBoxオーバーレイ）',
    'preview.hintShort': 'アップロード後に表示します',
    'preview.failed': 'プレビューの表示に失敗しました',

    'busy.title': '解析中…',
    'busy.hint': '結果が返るまでお待ちください',

    'overlay.none': 'なし',
    'overlay.lines': '行',
    'overlay.words': '単語',
    'overlay.paragraphs': '段落',
    'overlay.figures': '図',
    'overlay.formulas': '数式',
    'overlay.barcodes': 'バーコード/QR',
    'overlay.tables': 'テーブル',
    'overlay.keyValuePairs': 'KVP',
    'overlay.selectionMarks': '選択マーク',

    'structure.hint': '解析後にparagraphsとsectionsの構造を表示します',
    'structure.noData': 'このドキュメントにはparagraphsまたはsectionsデータがありません',
    'markdown.hint': 'Output content format = markdown のときにここへ表示します',
    'raw.hint': 'Output content format = markdown のときにここへ生テキストで表示します',

    'items.hint': '解析後にここへ階層表示します',
    'items.section.pages': 'ページ',
    'items.section.documents': 'ドキュメント',
    'items.section.tables': 'テーブル',
    'items.section.keyValuePairs': 'キーと値のペア',
    'items.section.selectionMarks': '選択マーク',
    'items.cells': 'セル',
    'items.noPages': 'ページがありません',
    'items.noLines': '行がありません',
    'items.noDocuments': 'ドキュメントがありません',
    'items.noTables': 'テーブルがありません',
    'items.noKeyValuePairs': 'キーと値のペアがありません',
    'items.noCells': 'セルがありません',
    'items.showThisPage': 'このページを表示',
    'items.linesBBox': '行 BBox',
    'items.wordsBBox': '単語 BBox',
    'items.linesFirst': '行（先頭 {n} 件）',
    'items.more': '…（あと {n} 件）',
    'items.tablesCellsBBox': 'テーブル (+ セル) の BBox を表示',
    'items.meta.apiVersion': 'apiVersion',
    'items.meta.contentLength': 'contentLength',
    'items.pageDetails': 'ページ #{page} (行={lines}, 単語={words})',
    'items.pageMetrics': '幅: {width}\n高さ: {height}\n単位: {unit}',
    'items.documentDetails': 'ドキュメント #{index} (type={type}, confidence={confidence})',
    'items.tableDetails': 'テーブル #{index} (page={page}, rows={rows}, cols={cols})',
    'items.tableMetrics': 'boundingRegions: {regions}\ncells: {cells}',
    'items.selectionPage': 'ページ #{page} ({count})',
    'items.selectionRow': '#{index}: state={state} conf={confidence}',
    'items.paragraphTooltip': '段落 #{index}{role}\n{content}',
    'items.formulaTooltip': '数式 ({kind})\n{value}',
    'items.formulaTooltipNoValue': '数式 ({kind})',
    'json.hint': '解析後にJSONを表示します',
    'json.loading': '解析中…',
    'json.requestHint': '解析後にリクエストJSONを表示します',

    'structure3d.mode': 'モード',
    'structure3d.mode.page': '現在のページ',
    'structure3d.mode.all': '全ページ',
    'structure3d.text': 'テキスト',
    'structure3d.explode': '分解',
    'structure3d.zoom': 'ズーム',
    'structure3d.hint': 'ドラッグで回転 / ホイールでズーム / タップで詳細',
    'structure3d.stage': '3D document structure stage',
    'structure3d.selection': '選択',
    'structure3d.empty.noOverlay': 'この結果には3D表示できるオーバーレイ要素がありません',
    'structure3d.empty.afterAnalyze': '解析後に3D Structureを表示します',

    'cache.hit': 'キャッシュ済み: Analyze は保存済み結果を再利用します',
    'alert.selectFile': 'ファイルを選択してください',
    'alert.uploadFirst': '先にファイルをアップロードしてください',
    'alert.selectModel': 'モデルIDを選択/入力してください',
    'alert.errorProcessingResult': '結果の処理中にエラーが発生しました',
    'alert.timeout': 'タイムアウトしました',
    'alert.noData': 'データがありません',
    'alert.markedLoadFailed': 'Markdownライブラリの読み込みに失敗しました',
    'alert.markdownRenderFailed': 'Markdown の描画に失敗しました',

    'label.total': '合計',

    'decision.valid': '妥当',
    'decision.invalid': '不要',
    'decision.unknown': '未判定',

    'modal.fullText': '全文表示',
    'modal.copy': 'コピー',
    'modal.close': '閉じる',
    'modal.full': '全文',
    'modal.fullTitle': '全文表示とコピー',

    'error.pdfjsNotLoaded': 'pdf.js が読み込まれていません（CDN読込に失敗した可能性があります）',

    'error.uploadFailedGeneric': 'アップロードに失敗しました',
    'error.analyzeFailedGeneric': '解析に失敗しました',
    'error.jobLookupFailedGeneric': 'ジョブの取得に失敗しました',
    'error.jobFailedGeneric': 'ジョブが失敗しました',
    'error.resultFetchFailedGeneric': '結果の取得に失敗しました',
    'error.cacheReloadFailedGeneric': 'キャッシュの再読み込みに失敗しました',
    'error.imageLoadFailed': '画像の読み込みに失敗しました',
    'error.cuContentCategoriesInvalid': 'Content categories は有効な JSON で入力してください',
    'error.cuContentCategoriesMustObject': 'Content categories は JSON object で指定してください',

    'summary.modelId': 'modelId',
    'summary.pages': 'ページ数',
    'summary.documents': 'ドキュメント数',
    'summary.tables': 'テーブル数',
    'summary.keyValuePairs': 'キーと値のペア数',
    'summary.pageLine': 'ページ #{n}: 行={lines}, 単語={words}',

    'service.di': 'Document Intelligence',
    'service.cu': 'Content Understanding',
    'service.cuDisabled': 'Content Understanding は未設定です（CU_ENDPOINT が必要）',

    'media.hint': '音声/動画ファイルをアップロードすると再生できます',
    'preview.tabs.media': 'メディア',

    'cu.summary.analyzerId': 'analyzerId',
    'cu.summary.contents': 'contents',
    'cu.summary.status': 'status',
    'cu.fields': 'フィールド',
    'cu.markdown': 'Markdown',
    'cu.noFields': 'フィールドがありません',
    'cu.confidence': '信頼度',
    'cu.transcript': 'トランスクリプト',
    'cu.noTranscript': 'トランスクリプトがありません',
    'cu.contentSummary': 'CU Content [{index}] - {kind} - {path}',
    'cu.contentMeta': 'MIME={mime} | ページ={pages} | Markdown={chars} 文字 | フィールド={fields}',
    'cu.contentStats': '{message} | ページ={pages} / 段落={paragraphs} / テーブル={tables}',

    'results.tabs.cuFields': 'CU フィールド',
    'results.tabs.cuMarkdown': 'CU Markdown',

    'risk.high': 'High',
    'risk.medium': 'Medium',
    'risk.low': 'Low',

    'model.needsSchema': 'フィールドスキーマ必須',
    'alert.needsSchema': 'このアナライザー ({model}) はフィールドスキーマの定義が必要です。Azure Portal でカスタムアナライザーを作成してください。',
    'alert.needsSchemaEmpty': 'このアナライザー ({model}) にはフィールドスキーマが必要です。CU オプションの「フィールドスキーマ」欄に JSON を入力してください。',
    'field.cuFieldSchema': 'フィールドスキーマ',
    'hint.cuFieldSchema': 'このアナライザーはフィールドスキーマが必須です。抽出したいフィールドを定義してください。',
    'hint.cuFieldSchemaTypes': 'type: string, number, integer, boolean, date, time, array, object',
    'field.cuFieldSchema.placeholder': '{"title":{"type":"string","description":"ドキュメントタイトル"},"amount":{"type":"number","description":"合計金額"}}',
    'error.cuFieldSchemaInvalid': 'フィールドスキーマは有効な JSON で入力してください',
    'error.cuFieldSchemaMustObject': 'フィールドスキーマは JSON object で指定してください',
    'schema.modeTable': 'テーブル',
    'schema.modeJson': 'JSON',
    'schema.colName': 'フィールド名',
    'schema.colType': 'type',
    'schema.colDesc': 'description',
    'schema.addField': '＋ フィールド追加',
    'schema.fieldNamePlaceholder': 'title',
    'schema.fieldDescPlaceholder': 'ドキュメントタイトル',

    'structure.paragraphs': '段落',
    'structure.sections': 'セクション',
    'structure.showMore': '続きを読む',
    'structure.showLess': '折りたたむ',
    'structure.stats.totalParagraphs': '段落総数',
    'structure.stats.titles': 'タイトル',
    'structure.stats.sectionHeadings': '節見出し',
    'structure.stats.pageHeaders': 'ページヘッダー',
    'structure.stats.pageFooters': 'ページフッター',
    'structure.stats.footnotes': '脚注',
    'structure.stats.totalSections': 'セクション総数',
    'structure.paragraphTitle': '段落 #{n}',
    'structure.sectionBadge': 'セクション {n}',
    'structure.level': 'レベル {n}',
    'structure.elements': '{n} 要素',
    'structure.characters': '{n} 文字',
    'structure.elementParagraph': '段落 #{n}',
    'structure.elementTable': 'テーブル #{n}',
    'structure.tablePreview': '{rows} 行 × {cols} 列',
    'structure.role.title': 'タイトル',
    'structure.role.sectionHeading': '節見出し',
    'structure.role.pageHeader': 'ページヘッダー',
    'structure.role.pageFooter': 'ページフッター',
    'structure.role.footnote': '脚注',
    'common.unknown': '不明',
    'common.fileInfo': '{name} ({type}, {size})',

    'theme.dark': 'ダーク',
    'theme.light': 'ライト',
    'theme.midnight': 'ミッドナイト',
    'theme.forest': 'フォレスト',
    'theme.solarized': 'ソラライズド',

    'model.filter.placeholder': 'モデルを検索…',
    'model.showUs': '米国専用モデルを表示',
    'model.empty': '一致するモデルがありません',
    'model.cat.analysis': 'ドキュメント分析',
    'model.cat.financial': '金融',
    'model.cat.identity': '本人確認',
    'model.cat.tax': '米国税務',
    'model.cat.mortgage': '米国住宅ローン',
    'model.cat.extraction': 'コンテンツ抽出',
    'model.cat.base': 'ベース',
    'model.cat.rag': 'RAG 検索',
    'model.cat.legal': '法務・ビジネス',
    'model.cat.procurement': '調達',
    'model.cat.other': 'その他',
    'model.cat.utility': 'ユーティリティ',

    'compare.button': '比較',
    'compare.title': '結果比較（セマンティック Diff）',
    'compare.close': '比較を閉じる',
    'compare.selectTwo': '2つ以上のキャッシュ結果にチェックを入れてください',
    'compare.loading': '結果を読み込み中…',
    'compare.identical': '同一',
    'compare.added': '追加',
    'compare.removed': '削除',
    'compare.changed': '変更',
    'compare.unchanged': '同一',
    'compare.onlyIn': '{label} のみ',
    'compare.expandAll': 'すべて展開',
    'compare.collapseAll': 'すべて折りたたむ',
    'compare.showOnlyDiffs': '差分のみ',
    'compare.showAll': 'すべて表示',
    'compare.stats': '合計: {total} パス / 差分: {diffs} / 同一: {same}',
    'compare.noResults': '比較する結果がありません',
    'compare.path': 'パス',
  },
  en: {
    'app.title.di': 'RAGOps Studio for Document Intelligence',
    'app.title.cu': 'RAGOps Studio for Content Understanding',

    'status.ready': 'Ready',
    'status.readyPreviewOk': 'Ready (preview OK)',
    'status.readyPreviewFailed': 'Ready (preview failed)',
    'status.uploadDisabled': 'Upload disabled',
    'status.readyToUpload': 'Ready to upload',
    'status.uploading': 'Uploading…',
    'status.uploadFailed': 'Upload failed',
    'status.analyzingQueued': 'Analyzing (queued)…',
    'status.analyzing': 'Analyzing…',
    'status.analyzingWithStatus': 'Analyzing ({status})…',
    'status.analyzeFailed': 'Analyze failed',
    'status.jobLookupFailed': 'Job lookup failed',
    'status.failed': 'Failed',
    'status.resultFetchFailed': 'Result fetch failed',
    'status.succeeded': 'Succeeded',
    'status.errorProcessingResult': 'Error processing result',
    'status.timeout': 'Timeout',
    'status.cacheReloadInProgress': 'Cache reload in progress…',
    'status.cacheReloaded': 'Cache reloaded{suffix}',
    'status.cacheReloadFailed': 'Cache reload failed',
    'status.initFailed': 'Init failed',

    'risk.high': 'High',
    'risk.medium': 'Medium',
    'risk.low': 'Low',

    'structure.paragraphs': 'Paragraphs',
    'structure.sections': 'Sections',

    'header.language': 'Language',
    'header.theme': 'Theme',

    'main.tabs.aria': 'Main view',
    'main.tabs.input': 'Input / Model',
    'main.tabs.preview': 'Preview',
    'main.tabs.results': 'Results',

    'pane.input.aria': 'Input / Model',
    'pane.input.title': 'Input / Model',
    'pane.preview.aria': 'Preview',
    'pane.preview.title': 'Preview',
    'pane.results.aria': 'Results',
    'pane.results.title': 'Results',

    'results.tabs.summary': 'Summary',
    'results.tabs.items': 'Items',
    'results.tabs.json': 'Response JSON',
    'results.tabs.requestJson': 'Request JSON',

    'action.analyze': 'Analyze',
    'action.upload': 'Upload',
    'action.downloadJson': 'Download JSON',
    'action.expandAll': 'Expand All',
    'action.collapseAll': 'Collapse All',

    'input.tabs.aria': 'Input pane tabs',
    'input.tabs.work': 'Input',
    'input.tabs.library': 'Library',

    'field.file': 'File',
    'field.model': 'Model',
    'field.customModelId': 'Custom model ID (optional)',
    'field.customModelId.placeholder': 'e.g. 01234567-.... or my-model',
    'field.analysisOptions': 'Analysis options',
    'field.cuOptions': 'CU request / document config',
    'field.cuRequestOptions': 'Request options',
    'field.cuGeneralOptions': 'General',
    'field.cuDocumentOptions': 'Document extraction',
    'field.cuFormatOptions': 'Output format',
    'field.cuSegmentationOptions': 'Classification / segmentation',
    'field.cuReturnDetails': 'Return details',
    'field.cuOmitContent': 'Omit content',
    'field.cuEstimateFieldSource': 'Field source / confidence',
    'field.cuEnableOcr': 'OCR',
    'field.cuEnableLayout': 'Layout',
    'field.cuEnableFormula': 'Formula',
    'field.cuEnableBarcode': 'Barcode',
    'field.cuEnableFigureDescription': 'Figure description',
    'field.cuEnableFigureAnalysis': 'Figure analysis',
    'field.cuEnableAnnotations': 'Annotations',
    'field.cuTableFormat': 'Table format',
    'field.cuChartFormat': 'Chart format',
    'field.cuAnnotationFormat': 'Annotation format',
    'field.cuEnableSegment': 'Enable segment',
    'field.cuSegmentPerPage': 'Segment per page',
    'field.cuContentCategories': 'Content categories (JSON)',
    'field.cuContentCategories.placeholder': '{"invoice":{"description":"Invoice pages","analyzerId":"prebuilt-invoice"},"other":{"description":"Any other page"}}',
    'field.cuBoolean.default': '(service default)',
    'field.cuBoolean.true': 'Enabled (true)',
    'field.cuBoolean.false': 'Disabled (false)',
    'field.pages': 'Pages',
    'field.pages.placeholder': 'e.g. 1-3,5',
    'field.locale': 'Locale',
    'field.locale.placeholder': 'e.g. en-US',
    'field.contentRange': 'Content range',
    'field.contentRange.placeholder': 'e.g. 1-3,5 or 0-30000',
    'field.processingLocation': 'Processing location',
    'field.processingLocation.default': '(default)',
    'tooltip.diHighRes': 'Default: disabled. Runs OCR at higher resolution to handle fine print and large-format documents. Use it for drawings or documents with very small text.',
    'tooltip.diFormulas': 'Default: disabled. Detects mathematical expressions and returns them in the formulas collection with location metadata.',
    'tooltip.diBarcodes': 'Default: disabled. Detects barcodes and QR codes and returns decoded values and barcode kinds.',
    'tooltip.diStyleFont': 'Default: disabled. Enables recognition of font and text styling information. Useful when font treatment carries meaning.',
    'tooltip.diPages': 'Default: all pages when omitted. Uses 1-based page numbers or ranges such as 1-3,5,7-9. Useful for partial analysis of large documents.',
    'tooltip.diLocale': 'Default: auto-detect. Locale hint for text recognition and analysis. You can provide a language code such as en or a BCP 47 tag such as en-US. Only set it when you are confident about the document language.',
    'tooltip.diOutputContentFormat': 'Default: text. Chooses the top-level content format. markdown preserves document structure and is especially useful for layout output and RAG/LLM scenarios.',
    'tooltip.diQueryFields': 'Default: none. Specifies additional fields to extract. Requires the queryFields add-on feature and supports up to 20 requested fields. Useful for extending prebuilt or layout extraction without retraining.',
    'tooltip.cuContentRange': 'Default: the full input. Range of the input to analyze. Documents use 1-based page numbers, while audio and video use integer milliseconds, and you can combine ranges like 1-3,5,9-.',
    'tooltip.cuProcessingLocation': 'Default: global. Controls where the service may process the data. Choose global, geography, or dataZone to align with residency, performance, or capacity requirements.',
    'tooltip.cuReturnDetails': 'Default: false, though it can vary by analyzer. Returns detailed metadata such as confidence scores, bounding boxes, text spans, and other response details. Useful for validation and debugging, but it increases response size.',
    'tooltip.cuOmitContent': 'Default: false. Omits the content object for this analyzer from the result. This is useful with contentCategories when you only want results from routed subanalyzers.',
    'tooltip.cuEstimateFieldSource': 'Default: false, though it can vary by analyzer. Returns source grounding and confidence for extracted fields. Useful for validation workflows, evidence display, and UI highlighting.',
    'tooltip.cuEnableOcr': 'Default: true. Enables OCR for images and scanned documents. Keep it on for scans and image-based PDFs, or turn it off for native PDFs to reduce processing cost.',
    'tooltip.cuEnableLayout': 'Default: true. Extracts layout information such as paragraphs, lines, words, reading order, and document structure. Use it when downstream logic depends on document hierarchy.',
    'tooltip.cuEnableFormula': 'Default: true. Detects mathematical formulas and returns them in LaTeX form. Best suited for scientific, research, and technical documents.',
    'tooltip.cuEnableBarcode': 'Default: true. Detects barcodes and QR codes and returns decoded values. Useful for shipping labels, inventory documents, and product paperwork.',
    'tooltip.cuEnableFigureDescription': 'Default: false. Generates natural-language descriptions for figures, diagrams, images, and illustrations. Useful for accessibility and visual summarization.',
    'tooltip.cuEnableFigureAnalysis': 'Default: false. Performs deeper figure analysis, including chart data extraction and diagram component understanding. Useful for complex charts and diagrams.',
    'tooltip.cuEnableAnnotations': 'By default, annotations are not returned unless you enable them. Extracts annotation elements from digital PDFs and links them back to document content. Detailed annotation output also requires returnDetails.',
    'tooltip.cuTableFormat': 'Default: html. Chooses how extracted tables are represented in Markdown. Use html to preserve complex table structure, or markdown for simpler text-oriented processing.',
    'tooltip.cuChartFormat': 'Default: chartJs. Chooses how extracted charts are represented. chartJs is compatible with Chart.js for rerendering, while markdown is better for text-oriented downstream processing.',
    'tooltip.cuAnnotationFormat': 'Default: markdown. Chooses how annotations are represented in Markdown. none suppresses annotation markup, while markdown uses native Markdown-style annotation output.',
    'tooltip.cuEnableSegment': 'Default: false. Splits the content into logical segments based on contentCategories and classifies each segment. Use it for mixed documents that need different handling by section.',
    'tooltip.cuSegmentPerPage': 'Default: false. Forces segmentation to create one segment per page instead of using logical boundaries. Useful for page-by-page routing or parallel processing.',
    'tooltip.cuContentCategories': 'Default: not set. JSON definition of the categories used for classification. Each category must provide a description, and can optionally provide an analyzerId for routed downstream analysis. With enableSegment=true it splits and classifies; with false it classifies the whole file as one category.',
    'common.defaultOption': '(default)',
    'field.outputContentFormat': 'Output content format',
    'field.outputContentFormat.default': '(default)',
    'field.queryFields': 'Query fields',
    'field.queryFields.placeholder': 'FieldA,FieldB',
    'field.job': 'Job',
    'field.option.highRes': 'High resolution (ocrHighResolution)',
    'field.option.formulas': 'Formulas (formulas)',
    'field.option.barcodes': 'Barcodes / QR (barcodes)',
    'field.option.styleFont': 'Font / style (styleFont)',

    'hint.customModelOverride': 'You can override with a custom model ID below',
    'hint.analysisOptions': 'If omitted, service defaults are used. Values are sent as-is (case sensitive).',
    'hint.cuOptions': 'If left blank, the analyzer defaults are used. When any document config below is specified, the app sends an inline analyze body with runtime config.',
    'hint.cuContentCategories': 'Provide a JSON object keyed by category name. description is used as the routing prompt, and analyzerId is optional.',
    'hint.selectFileAndUpload': 'Choose a file and click “Upload”.',
    'hint.uploadDisabledUseCache': 'Uploads are temporarily disabled (use cached files).',

    'dropzone.aria': 'Select a file',
    'dropzone.input.aria': 'Choose file',
    'dropzone.title': 'Drop a file or click',
    'dropzone.hint': 'Select a PDF or image',

    'library.title': 'Cached files',
    'library.hint': 'Load from server-side cache',
    'library.refresh': 'Reload from /app/storage',
    'library.loading': 'Loading…',
    'library.none': 'No cached files yet',
    'library.models': 'Models',
    'library.loadVariant': 'Click to load cached result',
    'library.loadingVariant': 'Loading cached result…',
    'library.variantLoadFailed': 'Failed to load cached result',
    'library.failedToLoad': 'Failed to load',
    'library.delete': 'Delete',
    'library.deleteConfirm': 'Delete cache and file for "{name}"?',
    'library.deleted': 'Deleted (caches: {caches}, files: {docs})',
    'library.deleteFailed': 'Failed to delete',
    'library.tabLoadFailed': 'Failed to load the tab',

    'splitter.left': 'Resize Input/Preview',
    'splitter.right': 'Resize Preview/Results',

    'preview.tabs.document': 'Document',
    'preview.tabs.structure': 'Structure',
    'preview.tabs.structure3d': '3D Structure',
    'preview.tabs.markdown': 'Markdown',
    'preview.tabs.raw': 'Raw',
    'preview.prev': 'Prev',
    'preview.next': 'Next',
    'preview.page': 'Page {n}',
    'preview.bbox': 'BBox',
    'preview.hint': 'Shown after upload (PDF uses PDF.js rendering + BBox overlay)',
    'preview.hintShort': 'Shown after upload',
    'preview.failed': 'Failed to render preview',

    'busy.title': 'Analyzing…',
    'busy.hint': 'Please wait for the result',

    'overlay.none': 'None',
    'overlay.lines': 'Lines',
    'overlay.words': 'Words',
    'overlay.paragraphs': 'Paragraphs',
    'overlay.figures': 'Figures',
    'overlay.formulas': 'Formulas',
    'overlay.barcodes': 'Barcodes/QR',
    'overlay.tables': 'Tables',
    'overlay.keyValuePairs': 'KeyValuePairs',
    'overlay.selectionMarks': 'SelectionMarks',

    'structure.hint': 'After analysis, paragraphs/sections structure is shown here',
    'structure.noData': 'This document has no paragraphs/sections data',
    'markdown.hint': 'Shown here when output content format is markdown',
    'raw.hint': 'Raw text is shown here when output content format is markdown',

    'items.hint': 'Hierarchical view will appear here after analysis',
    'items.section.pages': 'Pages',
    'items.section.documents': 'Documents',
    'items.section.tables': 'Tables',
    'items.section.keyValuePairs': 'KeyValuePairs',
    'items.section.selectionMarks': 'SelectionMarks',
    'items.cells': 'Cells',
    'items.noPages': 'No pages',
    'items.noLines': 'No lines',
    'items.noDocuments': 'No documents',
    'items.noTables': 'No tables',
    'items.noKeyValuePairs': 'No key-value pairs',
    'items.noCells': 'No cells',
    'items.showThisPage': 'Show this page',
    'items.linesBBox': 'Lines BBox',
    'items.wordsBBox': 'Words BBox',
    'items.linesFirst': 'Lines (first {n})',
    'items.more': '… ({n} more)',
    'items.tablesCellsBBox': 'Show Tables(+Cells) BBox',
    'items.meta.apiVersion': 'apiVersion',
    'items.meta.contentLength': 'contentLength',
    'items.pageDetails': 'Page #{page} (lines={lines}, words={words})',
    'items.pageMetrics': 'width: {width}\nheight: {height}\nunit: {unit}',
    'items.documentDetails': 'Document #{index} (type={type}, confidence={confidence})',
    'items.tableDetails': 'Table #{index} (page={page}, rows={rows}, cols={cols})',
    'items.tableMetrics': 'boundingRegions: {regions}\ncells: {cells}',
    'items.selectionPage': 'Page #{page} ({count})',
    'items.selectionRow': '#{index}: state={state} conf={confidence}',
    'items.paragraphTooltip': 'Paragraph #{index}{role}\n{content}',
    'items.formulaTooltip': 'Formula ({kind})\n{value}',
    'items.formulaTooltipNoValue': 'Formula ({kind})',
    'json.hint': 'JSON will appear here after analysis',
    'json.loading': 'Analyzing…',
    'json.requestHint': 'Request JSON will appear here after analysis',

    'structure3d.mode': 'Mode',
    'structure3d.mode.page': 'Current page',
    'structure3d.mode.all': 'All pages',
    'structure3d.text': 'Text',
    'structure3d.explode': 'Explode',
    'structure3d.zoom': 'Zoom',
    'structure3d.hint': 'Drag to rotate / wheel to zoom / tap for details',
    'structure3d.stage': '3D document structure stage',
    'structure3d.selection': 'Selection',
    'structure3d.empty.noOverlay': 'No overlay elements available for 3D view in this result',
    'structure3d.empty.afterAnalyze': '3D Structure will appear here after analysis',

    'cache.hit': 'Cached: Analyze will reuse the saved result',
    'alert.selectFile': 'Please choose a file',
    'alert.uploadFirst': 'Please upload a file first',
    'alert.selectModel': 'Select or enter a model ID',
    'alert.errorProcessingResult': 'An error occurred while processing the result',
    'alert.timeout': 'Timed out',
    'alert.noData': 'No data',
    'alert.markedLoadFailed': 'Failed to load Markdown library',
    'alert.markdownRenderFailed': 'Failed to render Markdown',

    'label.total': 'Total',

    'decision.valid': 'Valid',
    'decision.invalid': 'Invalid',
    'decision.unknown': 'Unknown',

    'modal.fullText': 'Full text',
    'modal.copy': 'Copy',
    'modal.close': 'Close',
    'modal.full': 'Full',
    'modal.fullTitle': 'View full text and copy',

    'error.pdfjsNotLoaded': 'pdf.js is not loaded (CDN may have failed)',

    'error.uploadFailedGeneric': 'Upload failed',
    'error.analyzeFailedGeneric': 'Analyze failed',
    'error.jobLookupFailedGeneric': 'Job lookup failed',
    'error.jobFailedGeneric': 'Job failed',
    'error.resultFetchFailedGeneric': 'Result fetch failed',
    'error.cacheReloadFailedGeneric': 'Cache reload failed',
    'error.imageLoadFailed': 'Image load failed',
    'error.cuContentCategoriesInvalid': 'Content categories must be valid JSON',
    'error.cuContentCategoriesMustObject': 'Content categories must be a JSON object',

    'summary.modelId': 'modelId',
    'summary.pages': 'pages',
    'summary.documents': 'documents',
    'summary.tables': 'tables',
    'summary.keyValuePairs': 'keyValuePairs',
    'summary.pageLine': 'page #{n}: lines={lines}, words={words}',

    'service.di': 'Document Intelligence',
    'service.cu': 'Content Understanding',
    'service.cuDisabled': 'Content Understanding is not configured (CU_ENDPOINT required)',

    'media.hint': 'Upload an audio/video file to play it',
    'preview.tabs.media': 'Media',

    'cu.summary.analyzerId': 'analyzerId',
    'cu.summary.contents': 'contents',
    'cu.summary.status': 'status',
    'cu.fields': 'Fields',
    'cu.markdown': 'Markdown',
    'cu.noFields': 'No fields',
    'cu.confidence': 'Confidence',
    'cu.transcript': 'Transcript',
    'cu.noTranscript': 'No transcript',
    'cu.contentSummary': 'CU Content [{index}] - {kind} - {path}',
    'cu.contentMeta': 'MIME={mime} | pages={pages} | markdown={chars} chars | fields={fields}',
    'cu.contentStats': '{message} | pages={pages} / paragraphs={paragraphs} / tables={tables}',

    'results.tabs.cuFields': 'CU Fields',
    'results.tabs.cuMarkdown': 'CU Markdown',

    'structure.showMore': 'Show More',
    'structure.showLess': 'Show Less',

    'model.needsSchema': 'Field schema required',
    'alert.needsSchema': 'This analyzer ({model}) requires a defined field schema. Please create a custom analyzer in the Azure Portal.',
    'alert.needsSchemaEmpty': 'This analyzer ({model}) requires a field schema. Enter the field definitions JSON in the "Field schema" section of CU options.',
    'field.cuFieldSchema': 'Field schema',
    'hint.cuFieldSchema': 'This analyzer requires a field schema. Define the fields to extract.',
    'hint.cuFieldSchemaTypes': 'type: string, number, integer, boolean, date, time, array, object',
    'field.cuFieldSchema.placeholder': '{"title":{"type":"string","description":"Document title"},"amount":{"type":"number","description":"Total amount"}}',
    'error.cuFieldSchemaInvalid': 'Field schema must be valid JSON',
    'error.cuFieldSchemaMustObject': 'Field schema must be a JSON object',
    'schema.modeTable': 'Table',
    'schema.modeJson': 'JSON',
    'schema.colName': 'Field name',
    'schema.colType': 'type',
    'schema.colDesc': 'description',
    'schema.addField': '+ Add field',
    'schema.fieldNamePlaceholder': 'title',
    'schema.fieldDescPlaceholder': 'Document title',
    'structure.stats.totalParagraphs': 'Total Paragraphs',
    'structure.stats.titles': 'Titles',
    'structure.stats.sectionHeadings': 'Section Headings',
    'structure.stats.pageHeaders': 'Page Headers',
    'structure.stats.pageFooters': 'Page Footers',
    'structure.stats.footnotes': 'Footnotes',
    'structure.stats.totalSections': 'Total Sections',
    'structure.paragraphTitle': 'Paragraph #{n}',
    'structure.sectionBadge': 'Section {n}',
    'structure.level': 'Level {n}',
    'structure.elements': '{n} elements',
    'structure.characters': '{n} chars',
    'structure.elementParagraph': 'Paragraph #{n}',
    'structure.elementTable': 'Table #{n}',
    'structure.tablePreview': '{rows} rows × {cols} cols',
    'structure.role.title': 'Title',
    'structure.role.sectionHeading': 'Section Heading',
    'structure.role.pageHeader': 'Page Header',
    'structure.role.pageFooter': 'Page Footer',
    'structure.role.footnote': 'Footnote',
    'common.unknown': 'unknown',
    'common.fileInfo': '{name} ({type}, {size})',

    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'theme.midnight': 'Midnight',
    'theme.forest': 'Forest',
    'theme.solarized': 'Solarized',

    'model.filter.placeholder': 'Filter models…',
    'model.showUs': 'Show US-only models',
    'model.empty': 'No matching models',
    'model.cat.analysis': 'Document Analysis',
    'model.cat.financial': 'Financial',
    'model.cat.identity': 'Identity',
    'model.cat.tax': 'US Tax',
    'model.cat.mortgage': 'US Mortgage',
    'model.cat.extraction': 'Content Extraction',
    'model.cat.base': 'Base',
    'model.cat.rag': 'RAG Search',
    'model.cat.legal': 'Legal & Business',
    'model.cat.procurement': 'Procurement',
    'model.cat.other': 'Other',
    'model.cat.utility': 'Utility',

    'compare.button': 'Compare',
    'compare.title': 'Result Comparison (Semantic Diff)',
    'compare.close': 'Close comparison',
    'compare.selectTwo': 'Check 2 or more cached results to compare',
    'compare.loading': 'Loading results…',
    'compare.identical': 'Identical',
    'compare.added': 'Added',
    'compare.removed': 'Removed',
    'compare.changed': 'Changed',
    'compare.unchanged': 'Identical',
    'compare.onlyIn': 'Only in {label}',
    'compare.expandAll': 'Expand All',
    'compare.collapseAll': 'Collapse All',
    'compare.showOnlyDiffs': 'Diffs only',
    'compare.showAll': 'Show all',
    'compare.stats': 'Total: {total} paths / Diffs: {diffs} / Same: {same}',
    'compare.noResults': 'No results to compare',
    'compare.path': 'Path',
  },
};

function normalizeLang(lang) {
  const raw = (lang || '').toString().trim().toLowerCase();
  if (raw === 'ja' || raw.startsWith('ja-')) return 'ja';
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  return 'ja';
}

let currentLang = normalizeLang(window.__APP_CONFIG__?.defaultLang || 'ja');

function tr(key, vars = null) {
  const dict = I18N[currentLang] || I18N.ja;
  const fallback = I18N.en || {};
  let s = dict[key] ?? fallback[key] ?? String(key);
  if (vars && typeof vars === 'object') {
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replaceAll(`{${k}}`, String(v));
    });
  }
  return s;
}

function applyTranslationsToDom() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = tr(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.setAttribute('placeholder', tr(key));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (!key) return;
    el.setAttribute('aria-label', tr(key));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.setAttribute('title', tr(key));
  });
}

function getAppTitle(service = currentService) {
  return tr(service === 'cu' ? 'app.title.cu' : 'app.title.di');
}

function applyAppTitle(service = currentService) {
  const titleText = getAppTitle(service);
  document.title = titleText;

  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = titleText;

  const headerTitle = document.getElementById('appHeaderTitle');
  if (headerTitle) headerTitle.textContent = titleText;
}

function formatFileInfo(name, contentType, size) {
  const safeType = contentType || tr('common.unknown');
  return tr('common.fileInfo', {
    name: name || '-',
    type: safeType,
    size: formatSize(size),
  });
}

function formatDocumentInfo(doc) {
  return formatFileInfo(doc?.filename, doc?.contentType, doc?.size);
}

function getStructureRoleLabel(role) {
  if (!role) return '';
  const key = `structure.role.${role}`;
  const label = tr(key);
  return label === key ? role : label;
}

function setLangMenuLabel() {
  const label = document.getElementById('langMenuLabel');
  if (!label) return;
  const found = SUPPORTED_LANGS.find(x => x.id === currentLang);
  label.textContent = found ? found.label : currentLang;
}

function setFileInfoHintIfEmpty() {
  const info = document.getElementById('fileInfo');
  if (!info) return;
  const input = document.getElementById('fileInput');
  const hasFile = !!(input && input.files && input.files.length > 0);
  if (hasFile) return;
  info.textContent = UPLOADS_ENABLED ? tr('hint.selectFileAndUpload') : tr('hint.uploadDisabledUseCache');
}

function applyLanguage(lang, { persist = true } = {}) {
  currentLang = normalizeLang(lang);
  document.documentElement.setAttribute('lang', currentLang);
  if (persist) {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    } catch {
      // ignore
    }
  }
  applyTranslationsToDom();
  applyAppTitle();
  setLangMenuLabel();
  setFileInfoHintIfEmpty();
  refreshThemeMenuText();
  refreshStaticButtonLabels();
  refreshDynamicUiForLanguage();
  loadUserTabs();
}

function refreshDynamicUiForLanguage() {
  if (currentDocument) {
    const fileInfo = document.getElementById('fileInfo');
    if (fileInfo) fileInfo.textContent = formatDocumentInfo(currentDocument);
  }

  // Model select option labels
  const modelSelect = document.getElementById('modelSelect');
  if (modelSelect && modelSelect.options && modelSelect.options.length) {
    Array.from(modelSelect.options).forEach((opt) => {
      const id = opt.value;
      if (!id) return;
      opt.textContent = getModelDisplayLabel(id);
    });
  }
  // Refresh picker button label & list
  const pickerLabel = document.getElementById('modelPickerLabel');
  if (pickerLabel && _pickerSelected) {
    pickerLabel.textContent = getModelDisplayLabel(_pickerSelected);
  }
  _renderPickerList();

  // Summary text
  const summary = document.getElementById('summaryText');
  if (summary && currentResult) {
    summary.textContent = currentService === 'cu'
      ? summarizeCuResult(currentJsonResult || currentResult, currentResult)
      : summarizeResult(currentResult);
  }

  // Result-driven panes
  const jsonViewer = document.getElementById('jsonViewer');
  if (jsonViewer && (currentJsonResult || currentResult)) {
    renderInteractiveJson(currentJsonResult || currentResult, jsonViewer);
  }
  const requestJsonViewer = document.getElementById('requestJsonViewer');
  if (requestJsonViewer && currentRequestPayload) {
    renderInteractiveJson(currentRequestPayload, requestJsonViewer);
  }
  if (currentResult) {
    if (currentService === 'cu') {
      try { renderCuItems(currentJsonResult || currentResult); } catch { /* ignore */ }
      try { renderStructureViewer(currentResult); } catch { /* ignore */ }
      try { renderStructure3D(currentResult); } catch { /* ignore */ }
      try { renderMarkdownPreview(currentResult); } catch { /* ignore */ }
    } else {
      try { renderItems(currentResult); } catch { /* ignore */ }
      try { renderStructureViewer(currentResult); } catch { /* ignore */ }
      try { renderStructure3D(currentResult); } catch { /* ignore */ }
      try { renderMarkdownPreview(currentResult); } catch { /* ignore */ }
    }
  }

  void loadLibrary();
}

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  const fromServer = window.__APP_CONFIG__?.defaultLang;
  if (fromServer) return fromServer;
  return navigator.language || 'ja';
}

const MODEL_LABELS = {
  // Document Analysis
  'prebuilt-read': { ja: '読み取り (OCR)', en: 'Read (OCR)' },
  'prebuilt-layout': { ja: 'レイアウト', en: 'Layout' },
  'prebuilt-document': { ja: '一般ドキュメント', en: 'General Document' },
  // Financial
  'prebuilt-invoice': { ja: '請求書', en: 'Invoice' },
  'prebuilt-receipt': { ja: '領収書', en: 'Receipt' },
  'prebuilt-receipt.generic': { ja: '領収書 (汎用)', en: 'Receipt (generic)' },
  'prebuilt-receipt.hotel': { ja: '領収書 (ホテル)', en: 'Receipt (hotel)' },
  'prebuilt-creditCard': { ja: 'クレジットカード', en: 'Credit Card' },
  'prebuilt-creditMemo': { ja: 'クレジットメモ', en: 'Credit Memo' },
  'prebuilt-bankStatement': { ja: '銀行明細 (US)', en: 'Bank Statement (US)' },
  'prebuilt-bankStatement.us': { ja: '銀行明細 (US)', en: 'Bank Statement (US)' },
  'prebuilt-check.us': { ja: '小切手 (US)', en: 'Check (US)' },
  'prebuilt-payStub.us': { ja: '給与明細 (US)', en: 'Pay Stub (US)' },
  'prebuilt-contract': { ja: '契約書', en: 'Contract' },
  // Identity
  'prebuilt-idDocument': { ja: '本人確認書類', en: 'ID Document' },
  'prebuilt-idDocument.generic': { ja: 'ID (汎用)', en: 'ID Document (generic)' },
  'prebuilt-idDocument.passport': { ja: 'パスポート', en: 'Passport' },
  'prebuilt-healthInsuranceCard.us': { ja: '健康保険証 (US)', en: 'Health Insurance Card (US)' },
  'prebuilt-marriageCertificate.us': { ja: '婚姻証明書 (US)', en: 'Marriage Certificate (US)' },
  // US Tax
  'prebuilt-tax.us': { ja: '米国税 (総合)', en: 'US Tax (general)' },
  'prebuilt-tax.us.w2': { ja: 'W-2', en: 'W-2' },
  'prebuilt-tax.us.w4': { ja: 'W-4', en: 'W-4' },
  'prebuilt-tax.us.1040': { ja: '1040', en: '1040' },
  'prebuilt-tax.us.1040.schedules': { ja: '1040 Schedules', en: '1040 Schedules' },
  'prebuilt-tax.us.1095A': { ja: '1095-A', en: '1095-A' },
  'prebuilt-tax.us.1095C': { ja: '1095-C', en: '1095-C' },
  'prebuilt-tax.us.1098': { ja: '1098', en: '1098' },
  'prebuilt-tax.us.1098E': { ja: '1098-E', en: '1098-E' },
  'prebuilt-tax.us.1098T': { ja: '1098-T', en: '1098-T' },
  'prebuilt-tax.us.1099': { ja: '1099', en: '1099' },
  'prebuilt-tax.us.1099Combo': { ja: '1099 Combo', en: '1099 Combo' },
  'prebuilt-tax.us.1099SSA': { ja: '1099-SSA', en: '1099-SSA' },
  // US Mortgage
  'prebuilt-mortgage.us': { ja: '米国住宅ローン (総合)', en: 'US Mortgage (general)' },
  'prebuilt-mortgage.us.1003': { ja: '1003 (URLA)', en: '1003 (URLA)' },
  'prebuilt-mortgage.us.1004': { ja: '1004 (鑑定)', en: '1004 (Appraisal)' },
  'prebuilt-mortgage.us.1005': { ja: '1005 (VOE)', en: '1005 (VOE)' },
  'prebuilt-mortgage.us.1008': { ja: '1008 (要約)', en: '1008 (Summary)' },
  'prebuilt-mortgage.us.closingDisclosure': { ja: 'Closing Disclosure', en: 'Closing Disclosure' },
  // CU Base
  'prebuilt-image': { ja: '画像', en: 'Image' },
  'prebuilt-audio': { ja: '音声', en: 'Audio' },
  'prebuilt-video': { ja: '動画', en: 'Video' },
  // CU RAG
  'prebuilt-documentSearch': { ja: 'ドキュメント検索 (RAG)', en: 'Document Search (RAG)' },
  'prebuilt-imageSearch': { ja: '画像検索', en: 'Image Search' },
  'prebuilt-audioSearch': { ja: '音声検索', en: 'Audio Search' },
  'prebuilt-videoSearch': { ja: '動画検索', en: 'Video Search' },
  // Procurement
  'prebuilt-procurement': { ja: '調達', en: 'Procurement' },
  'prebuilt-purchaseOrder': { ja: '発注書', en: 'Purchase Order' },
  // Other
  'prebuilt-utilityBill': { ja: '公共料金', en: 'Utility Bill' },
  // Utility
  'prebuilt-documentFieldSchema': { ja: 'フィールドスキーマ', en: 'Document Field Schema' },
  'prebuilt-documentFields': { ja: 'フィールド抽出', en: 'Document Fields' },
};

function getModelDisplayLabel(modelId) {
  const entry = MODEL_LABELS[modelId];
  const name = (entry && (entry[currentLang] || entry.en)) ? (entry[currentLang] || entry.en) : modelId;
  return `${name} (${modelId})`;
}

const MAIN_TABS_STORAGE_KEY = 'diMainTab';
const MAIN_TABS_BREAKPOINT_PX = 1024;

const INPUT_PANE_TAB_STORAGE_KEY = 'diInputPaneTab';

function initInputPaneTabs() {
  const tablist = document.getElementById('inputPaneTabs');
  if (!tablist) return;

  const buttons = Array.from(tablist.querySelectorAll('[data-input-tab]'));
  const panes = Array.from(document.querySelectorAll('.input-tabpane[id^="input-tab-"]'));
  if (buttons.length === 0 || panes.length === 0) return;

  function setActive(tabId) {
    const target = tabId || 'work';

    panes.forEach((p) => {
      const isActive = p.id === `input-tab-${target}`;
      p.classList.toggle('input-tabpane--active', isActive);
      p.toggleAttribute('hidden', !isActive);
    });

    buttons.forEach((b) => {
      const isActive = b.dataset.inputTab === target;
      b.classList.toggle('tab--active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.tabIndex = isActive ? 0 : -1;
    });

    try {
      localStorage.setItem(INPUT_PANE_TAB_STORAGE_KEY, target);
    } catch {
      // ignore
    }
  }

  tablist.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-input-tab]');
    if (!btn) return;
    setActive(btn.dataset.inputTab);
  });

  let saved = null;
  try {
    saved = localStorage.getItem(INPUT_PANE_TAB_STORAGE_KEY);
  } catch {
    saved = null;
  }
  setActive(saved || 'work');
}

const PANE_WIDTHS_STORAGE_KEY = 'diPaneWidths';
const MIN_LEFT_PX = 240;
const MIN_RIGHT_PX = 320;
const MIN_CENTER_PX = 320;
const MAX_LEFT_PX = 700;
const MAX_RIGHT_PX = 900;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function initSplitters() {
  const main = document.getElementById('mainRoot');
  const splitterLeft = document.getElementById('splitterLeft');
  const splitterRight = document.getElementById('splitterRight');
  const leftPane = document.getElementById('main-pane-input');
  const centerPane = document.getElementById('main-pane-preview');
  const rightPane = document.getElementById('main-pane-results');
  if (!main || !splitterLeft || !splitterRight || !leftPane || !centerPane || !rightPane) return;

  const desktopMq = window.matchMedia('(min-width: 1025px)');

  function applyWidths(widths) {
    if (!desktopMq.matches) return;
    if (!widths) return;
    const { left, right } = widths;
    if (Number.isFinite(left)) main.style.setProperty('--pane-left', `${left}px`);
    if (Number.isFinite(right)) main.style.setProperty('--pane-right', `${right}px`);
  }

  function loadWidths() {
    try {
      const raw = localStorage.getItem(PANE_WIDTHS_STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return {
        left: Number(obj.left),
        right: Number(obj.right),
      };
    } catch {
      return null;
    }
  }

  function saveWidths(left, right) {
    try {
      localStorage.setItem(PANE_WIDTHS_STORAGE_KEY, JSON.stringify({ left, right }));
    } catch {
      // ignore
    }
  }

  function getLayoutRects() {
    const mainRect = main.getBoundingClientRect();
    const leftRect = leftPane.getBoundingClientRect();
    const centerRect = centerPane.getBoundingClientRect();
    const rightRect = rightPane.getBoundingClientRect();
    return { mainRect, leftRect, centerRect, rightRect };
  }

  function getLayoutConstants() {
    const cs = getComputedStyle(main);
    const gap = Number.parseFloat(cs.columnGap || cs.gap) || 0;
    const splitter = Number.parseFloat(cs.getPropertyValue('--splitter')) || 10;
    // 5 columns => 4 gaps
    return { gap, splitter, totalGaps: gap * 4, totalSplitters: splitter * 2 };
  }

  function maxAllowedLeftPx(currentRightPx) {
    const mainRect = main.getBoundingClientRect();
    const { totalGaps, totalSplitters } = getLayoutConstants();
    const maxByWindow = mainRect.width - totalGaps - totalSplitters - MIN_CENTER_PX - currentRightPx;
    return clamp(maxByWindow, MIN_LEFT_PX, MAX_LEFT_PX);
  }

  function maxAllowedRightPx(currentLeftPx) {
    const mainRect = main.getBoundingClientRect();
    const { totalGaps, totalSplitters } = getLayoutConstants();
    const maxByWindow = mainRect.width - totalGaps - totalSplitters - MIN_CENTER_PX - currentLeftPx;
    return clamp(maxByWindow, MIN_RIGHT_PX, MAX_RIGHT_PX);
  }

  function startDrag(which, ev) {
    if (!desktopMq.matches) return;
    if (main.classList.contains('main--tabbed')) return;

    const { leftRect, rightRect } = getLayoutRects();
    const startX = ev.clientX;
    const startLeft = leftRect.width;
    const startRight = rightRect.width;

    const target = which === 'left' ? splitterLeft : splitterRight;
    target.setPointerCapture?.(ev.pointerId);

    function onMove(e) {
      const dx = e.clientX - startX;

      if (which === 'left') {
        const currentRight = Number.parseFloat(getComputedStyle(main).getPropertyValue('--pane-right')) || startRight;
        const maxLeft = maxAllowedLeftPx(currentRight);
        const newLeft = clamp(startLeft + dx, MIN_LEFT_PX, maxLeft);
        main.style.setProperty('--pane-left', `${Math.round(newLeft)}px`);
      } else {
        const currentLeft = Number.parseFloat(getComputedStyle(main).getPropertyValue('--pane-left')) || startLeft;
        const maxRight = maxAllowedRightPx(currentLeft);
        const newRight = clamp(startRight - dx, MIN_RIGHT_PX, maxRight);
        main.style.setProperty('--pane-right', `${Math.round(newRight)}px`);
      }
    }

    function onUp(e) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const leftVal = Number.parseFloat(getComputedStyle(main).getPropertyValue('--pane-left')) || startLeft;
      const rightVal = Number.parseFloat(getComputedStyle(main).getPropertyValue('--pane-right')) || startRight;
      saveWidths(Math.round(leftVal), Math.round(rightVal));

      try {
        target.releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  splitterLeft.addEventListener('pointerdown', (e) => startDrag('left', e));
  splitterRight.addEventListener('pointerdown', (e) => startDrag('right', e));

  function applyMode() {
    if (!desktopMq.matches) return;
    const saved = loadWidths();
    applyWidths(saved);
  }

  desktopMq.addEventListener?.('change', applyMode);
  window.addEventListener('resize', () => {
    if (!desktopMq.matches) return;
    // Clamp persisted widths into current window constraints
    const saved = loadWidths();
    if (!saved) return;
    const left = Number.isFinite(saved.left) ? saved.left : null;
    const right = Number.isFinite(saved.right) ? saved.right : null;
    if (left == null || right == null) return;
    const clampedLeft = clamp(left, MIN_LEFT_PX, maxAllowedLeftPx(right));
    const clampedRight = clamp(right, MIN_RIGHT_PX, maxAllowedRightPx(clampedLeft));
    main.style.setProperty('--pane-left', `${Math.round(clampedLeft)}px`);
    main.style.setProperty('--pane-right', `${Math.round(clampedRight)}px`);
  });

  applyMode();
}

function initMainTabs() {
  const main = document.getElementById('mainRoot');
  const tablist = document.getElementById('mainTabs');
  if (!main || !tablist) return;

  const buttons = Array.from(tablist.querySelectorAll('[data-main-tab]'));
  const panes = Array.from(document.querySelectorAll('[data-main-pane]'));
  if (buttons.length === 0 || panes.length === 0) return;

  const mq = window.matchMedia(`(max-width: ${MAIN_TABS_BREAKPOINT_PX}px)`);

  function setActive(tabId) {
    const target = tabId || 'input';
    panes.forEach((p) => {
      const isActive = p.dataset.mainPane === target;
      p.classList.toggle('pane--active', isActive);
      p.toggleAttribute('hidden', !isActive);
    });

    buttons.forEach((b) => {
      const isActive = b.dataset.mainTab === target;
      b.classList.toggle('main-tab--active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.tabIndex = isActive ? 0 : -1;
    });

    try {
      localStorage.setItem(MAIN_TABS_STORAGE_KEY, target);
    } catch {
      // ignore
    }
  }

  // Expose a tiny API so other flows (e.g. cache click) can switch tabs
  // only when responsive tabbed mode is enabled.
  try {
    window.__diMainTabSetActive = (tabId) => {
      if (!main.classList.contains('main--tabbed')) return false;
      setActive(tabId);
      return true;
    };
  } catch {
    // ignore
  }

  function enableTabMode() {
    main.classList.add('main--tabbed');
    tablist.hidden = false;

    let saved = null;
    try {
      saved = localStorage.getItem(MAIN_TABS_STORAGE_KEY);
    } catch {
      saved = null;
    }
    setActive(saved || 'input');
  }

  function disableTabMode() {
    main.classList.remove('main--tabbed');
    tablist.hidden = true;

    panes.forEach((p) => {
      p.classList.remove('pane--active');
      p.hidden = false;
    });

    buttons.forEach((b, idx) => {
      b.classList.toggle('main-tab--active', idx === 0);
      b.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      b.tabIndex = idx === 0 ? 0 : -1;
    });
  }

  function applyMode() {
    if (mq.matches) enableTabMode();
    else disableTabMode();
  }

  tablist.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-main-tab]');
    if (!btn) return;
    if (!main.classList.contains('main--tabbed')) return;
    setActive(btn.dataset.mainTab);
  });

  mq.addEventListener?.('change', applyMode);
  window.addEventListener('resize', applyMode);
  applyMode();
}

function applyTheme(theme) {
  const ids = THEMES.map(t => t.id);
  const themeId = ids.includes(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', themeId);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // ignore
  }
  const label = document.getElementById('themeMenuLabel');
  if (label) {
    const found = THEMES.find(x => x.id === themeId);
    label.textContent = found ? tr(found.key) : themeId;
  }
}

function refreshThemeMenuText() {
  const panel = document.getElementById('themeMenuPanel');
  if (!panel) return;
  panel.innerHTML = '';
  THEMES.forEach((th) => {
    const b = document.createElement('button');
    b.className = 'menu__item';
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.dataset.theme = th.id;
    b.textContent = tr(th.key);
    panel.appendChild(b);
  });
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    saved = null;
  }
  applyTheme(saved || DEFAULT_THEME);
}

function initThemeMenu() {
  const btn = document.getElementById('themeMenuBtn');
  const panel = document.getElementById('themeMenuPanel');
  if (!btn || !panel) return;

  refreshThemeMenuText();

  function openMenu() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    if (panel.hidden) openMenu();
    else closeMenu();
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMenu();
  });

  panel.addEventListener('click', (e) => {
    const el = e.target;
    if (!el || !el.dataset) return;
    const theme = el.dataset.theme;
    if (!theme) return;
    applyTheme(theme);
    closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (panel.hidden) return;
    const themeMenu = document.getElementById('themeMenu');
    if (!themeMenu) return;
    if (themeMenu.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!panel.hidden) closeMenu();
  });
}

function initUploadsDisabledBanner() {
  if (UPLOADS_ENABLED) return;
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('uploadDropzone');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setStatus(tr('status.uploadDisabled'));
    });
  }
  if (fileInput) fileInput.disabled = true;
  if (dropzone) {
    dropzone.classList.add('upload-dropzone--disabled');
    dropzone.setAttribute('aria-disabled', 'true');
  }
}

function initLanguageMenu() {
  const btn = document.getElementById('langMenuBtn');
  const panel = document.getElementById('langMenuPanel');
  if (!btn || !panel) return;

  function openMenu() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    if (panel.hidden) openMenu();
    else closeMenu();
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMenu();
  });

  panel.addEventListener('click', (e) => {
    const item = e.target?.closest?.('[data-lang]');
    if (!item) return;
    const lang = item.dataset.lang;
    if (!lang) return;
    applyLanguage(lang);
    closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (panel.hidden) return;
    const menu = document.getElementById('langMenu');
    if (!menu) return;
    if (menu.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!panel.hidden) closeMenu();
  });
}

function refreshStaticButtonLabels() {
  applyAppTitle();
  syncUploadButtonMode();
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function onFileSelected() {
  const input = document.getElementById('fileInput');
  if (!input) return;
  if (!input.files || input.files.length === 0) {
    hasPendingLocalFile = false;
    syncUploadButtonMode();
    return;
  }
  const file = input.files[0];
  hasPendingLocalFile = true;
  currentDocument = null;
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) analyzeBtn.disabled = true;
  setCacheInfo('');
  syncUploadButtonMode();
  const info = document.getElementById('fileInfo');
  if (info) {
    info.textContent = formatFileInfo(file.name, file.type, file.size);
  }
  setStatus(tr('status.readyToUpload'));
}

function syncUploadButtonMode() {
  const uploadBtn = document.getElementById('uploadBtn');
  if (!uploadBtn) return;

  let mode = 'upload';
  if (!UPLOADS_ENABLED) {
    mode = 'upload';
  } else if (hasPendingLocalFile) {
    mode = 'upload';
  } else if (currentDocument) {
    mode = 'analyze';
  }

  uploadActionMode = mode;
  uploadBtn.dataset.i18n = mode === 'analyze' ? 'action.analyze' : 'action.upload';
  uploadBtn.textContent = tr(uploadBtn.dataset.i18n);
  uploadBtn.classList.toggle('btn--primary', mode === 'analyze');
}

async function handleUploadButtonClick() {
  if (uploadActionMode === 'analyze') {
    await analyze();
    return;
  }
  await upload();
}

function initUploadDropzone() {
  const dropzone = document.getElementById('uploadDropzone');
  const input = document.getElementById('fileInput');
  if (!dropzone || !input) return;

  let suppressInputClickUntil = 0;

  const setActive = (on) => dropzone.classList.toggle('upload-dropzone--active', on);

  // Note: input[type=file] overlays the dropzone (opacity:0). Let the browser open
  // the picker natively on click, instead of calling input.click() here (which can
  // cause the dialog to reopen / open twice).

  input.addEventListener('click', (e) => {
    if (Date.now() < suppressInputClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  dropzone.addEventListener('keydown', (e) => {
    if (input.disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (input.disabled) return;
      setActive(true);
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      setActive(false);
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (input.disabled) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      // Some browsers fire a click after drop; prevent it from reopening the picker.
      suppressInputClickUntil = Date.now() + 600;
      try {
        const dt = new DataTransfer();
        Array.from(files).forEach(f => dt.items.add(f));
        input.files = dt.files;
      } catch (err) {
        console.warn('Failed to set files via DataTransfer', err);
        try {
          input.files = files;
        } catch (err2) {
          console.warn('Failed to set files directly', err2);
        }
      }
      onFileSelected();
    }
  });

  input.addEventListener('change', onFileSelected);
}

function setStatus(text) {
  document.getElementById('statusText').textContent = text;
}

function setCacheInfo(text) {
  const el = document.getElementById('cacheInfo');
  if (!el) return;
  el.textContent = text || '';
}

function setBusy(isBusy, message) {
  const busy = document.getElementById('busyOverlay');
  if (!busy) return;
  if (message) {
    const title = busy.querySelector('.busy__title');
    if (title) title.textContent = message;
  }
  busy.classList.toggle('busy--show', !!isBusy);
  busy.setAttribute('aria-hidden', String(!isBusy));
}

let tooltipPinned = false;

function isResponsiveTabMode() {
  const main = document.getElementById('mainRoot');
  return !!main && main.classList.contains('main--tabbed');
}

function hideTooltip() {
  const t = document.getElementById('bboxTooltip');
  if (!t) return;
  t.classList.remove('tooltip--show');
  t.setAttribute('aria-hidden', 'true');
  tooltipPinned = false;
}

function showTooltip(text, clientX, clientY) {
  const t = document.getElementById('bboxTooltip');
  const preview = document.getElementById('preview');
  if (!t || !preview) return;

  t.textContent = (text || '').toString();
  const rect = preview.getBoundingClientRect();
  const x = Math.max(8, Math.min(clientX - rect.left + 12, rect.width - 16));
  const y = Math.max(8, Math.min(clientY - rect.top + 12, rect.height - 16));
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
  t.classList.add('tooltip--show');
  t.setAttribute('aria-hidden', 'false');
  tooltipPinned = true;
}

function safePreviewJson(value, options = {}) {
  const {
    maxDepth = 4,
    maxArray = 20,
    maxString = 240,
  } = options;

  const seen = new WeakSet();

  function toPreview(v, depth) {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'number' || t === 'boolean') return v;
    if (t === 'string') {
      return v.length > maxString ? (v.slice(0, maxString) + '…') : v;
    }
    if (t !== 'object') return String(v);

    if (seen.has(v)) return '[Circular]';
    seen.add(v);

    if (depth >= maxDepth) {
      if (Array.isArray(v)) return `[Array(${v.length})]`;
      return '[Object]';
    }

    if (Array.isArray(v)) {
      const out = [];
      const n = Math.min(v.length, maxArray);
      for (let i = 0; i < n; i++) out.push(toPreview(v[i], depth + 1));
      if (v.length > n) out.push(`… (${v.length - n} more)`);
      return out;
    }

    const outObj = {};
    const keys = Object.keys(v);
    const n = Math.min(keys.length, 80);
    for (let i = 0; i < n; i++) {
      const k = keys[i];
      outObj[k] = toPreview(v[k], depth + 1);
    }
    if (keys.length > n) outObj['…'] = `${keys.length - n} more keys`;
    return outObj;
  }

  return JSON.stringify(toPreview(value, 0), null, 2);
}

function getModelId() {
  if (currentService !== 'cu') {
    const custom = document.getElementById('customModelId').value.trim();
    if (custom) return custom;
  }
  return document.getElementById('modelSelect').value;
}

function getTriStateBoolean(id) {
  const value = document.getElementById(id)?.value ?? '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function getSelectOptionValue(id) {
  const value = document.getElementById(id)?.value ?? '';
  return value || undefined;
}

function collectAnalyzeOptions() {
  if (currentService === 'cu') {
    const contentRange = document.getElementById('optCuContentRange')?.value.trim() || '';
    const processingLocation = document.getElementById('optCuProcessingLocation')?.value || '';
    const contentCategoriesRaw = document.getElementById('optCuContentCategories')?.value.trim() || '';

    let contentCategories;
    if (contentCategoriesRaw) {
      try {
        contentCategories = JSON.parse(contentCategoriesRaw);
      } catch {
        throw new Error(tr('error.cuContentCategoriesInvalid'));
      }
      if (!contentCategories || Array.isArray(contentCategories) || typeof contentCategories !== 'object') {
        throw new Error(tr('error.cuContentCategoriesMustObject'));
      }
    }

    const options = {
      content_range: contentRange || undefined,
      processing_location: processingLocation || undefined,
      return_details: getTriStateBoolean('optCuReturnDetails'),
      omit_content: getTriStateBoolean('optCuOmitContent'),
      estimate_field_source_and_confidence: getTriStateBoolean('optCuEstimateFieldSource'),
      enable_ocr: getTriStateBoolean('optCuEnableOcr'),
      enable_layout: getTriStateBoolean('optCuEnableLayout'),
      enable_formula: getTriStateBoolean('optCuEnableFormula'),
      enable_barcode: getTriStateBoolean('optCuEnableBarcode'),
      enable_figure_description: getTriStateBoolean('optCuEnableFigureDescription'),
      enable_figure_analysis: getTriStateBoolean('optCuEnableFigureAnalysis'),
      enable_annotations: getTriStateBoolean('optCuEnableAnnotations'),
      table_format: getSelectOptionValue('optCuTableFormat'),
      chart_format: getSelectOptionValue('optCuChartFormat'),
      annotation_format: getSelectOptionValue('optCuAnnotationFormat'),
      enable_segment: getTriStateBoolean('optCuEnableSegment'),
      segment_per_page: getTriStateBoolean('optCuSegmentPerPage'),
      content_categories: contentCategories || undefined,
    };

    // Field schema (required for prebuilt-image etc.)
    const fieldSchemaRaw = _getFieldSchemaJson();
    if (fieldSchemaRaw) {
      let fieldSchema;
      try {
        fieldSchema = JSON.parse(fieldSchemaRaw);
      } catch {
        throw new Error(tr('error.cuFieldSchemaInvalid'));
      }
      if (!fieldSchema || Array.isArray(fieldSchema) || typeof fieldSchema !== 'object') {
        throw new Error(tr('error.cuFieldSchemaMustObject'));
      }
      options.field_schema = fieldSchema;
    }

    return options;
  }

  const pages = document.getElementById('optPages')?.value.trim() || '';
  const locale = document.getElementById('optLocale')?.value.trim() || '';
  const outputContentFormat = document.getElementById('optOutputContentFormat')?.value || '';

  const queryFieldsRaw = document.getElementById('optQueryFields')?.value || '';
  const queryFields = queryFieldsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const options = {
    enable_high_resolution: document.getElementById('optHighRes')?.checked ? true : undefined,
    enable_formulas: document.getElementById('optFormulas')?.checked ? true : undefined,
    enable_barcodes: document.getElementById('optBarcodes')?.checked ? true : undefined,
    enable_style_font: document.getElementById('optStyleFont')?.checked ? true : undefined,
    pages: pages || undefined,
    locale: locale || undefined,
    output_content_format: outputContentFormat || undefined,
    query_fields: queryFields.length ? queryFields : undefined,
  };

  return options;
}

function stateKey(fileHash, modelId) {
  if (!fileHash || !modelId) return null;
  return `diState:${fileHash}:${modelId}`;
}

function loadUiState(fileHash, modelId) {
  const key = stateKey(fileHash, modelId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUiState() {
  if (!currentDocument || !currentModelId) return;
  const key = stateKey(currentDocument.fileHash, currentModelId);
  if (!key) return;
  const value = { overlayMode, pageNumber: currentPageNumber };
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function isPdf(contentType, filename) {
  if (contentType && contentType.toLowerCase().includes('pdf')) return true;
  return (filename || '').toLowerCase().endsWith('.pdf');
}

function ensurePdfJs() {
  if (!window.pdfjsLib) {
    throw new Error(tr('error.pdfjsNotLoaded'));
  }
}

function getViewerElements() {
  const preview = document.getElementById('preview');
  let viewer = preview.querySelector('.viewer');
  if (!viewer) {
    // Keep busyOverlay / tooltip inside preview
    const keepIds = new Set(['busyOverlay', 'bboxTooltip']);
    Array.from(preview.children).forEach((child) => {
      if (!keepIds.has(child.id)) child.remove();
    });
    viewer = document.createElement('div');
    viewer.className = 'viewer';

    const canvas = document.createElement('canvas');
    canvas.className = 'viewer__canvas';
    canvas.id = 'pdfCanvas';

    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.classList.add('viewer__overlay');
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.setAttribute('id', 'overlaySvg');

    viewer.appendChild(canvas);
    viewer.appendChild(overlay);
    // Place viewer at the beginning (so busy/tooltip overlay it)
    preview.prepend(viewer);
  }

  return {
    preview,
    viewer,
    canvas: preview.querySelector('#pdfCanvas'),
    overlay: preview.querySelector('#overlaySvg'),
  };
}

function setOverlayControlsEnabled(enabled) {
  document.getElementById('overlaySelect').disabled = !enabled;
}

function setPageControlsEnabled(enabled) {
  document.getElementById('prevPageBtn').disabled = !enabled;
  document.getElementById('nextPageBtn').disabled = !enabled;
  document.getElementById('pageSelect').disabled = !enabled;
}

function clearOverlay() {
  const { overlay } = getViewerElements();
  overlay.innerHTML = '';
  hideTooltip();
}

function diPageFor(pageNumber) {
  if (!currentResult || !Array.isArray(currentResult.pages)) return null;
  return currentResult.pages.find(p => p.pageNumber === pageNumber) || null;
}

function polygonToPath(polygon, pageW, pageH, canvasW, canvasH) {
  if (!Array.isArray(polygon) || polygon.length < 8) return null;
  const pts = [];
  for (let i = 0; i < polygon.length; i += 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    const px = (x / pageW) * canvasW;
    const py = (y / pageH) * canvasH;
    pts.push([px, py]);
  }
  const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  return d + ' Z';
}

function attachTooltipHandlers(el, text) {
  const safeText = (text || '').toString().trim();
  if (!safeText) return;
  el.addEventListener('mouseenter', (e) => {
    showTooltip(safeText, e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => {
    showTooltip(safeText, e.clientX, e.clientY);
  });
  el.addEventListener('mouseleave', () => {
    // In responsive (tab) mode, keep tooltip shown after tap
    if (isResponsiveTabMode() && tooltipPinned) return;
    hideTooltip();
  });

  // In responsive (tab) mode, use tap to show/pin tooltip since hover is unavailable
  el.addEventListener('click', (e) => {
    if (!isResponsiveTabMode()) return;
    e.preventDefault();
    e.stopPropagation();
    showTooltip(safeText, e.clientX, e.clientY);
  });
}

function initTooltipDismissOnResponsive() {
  const preview = document.getElementById('preview');
  const tooltip = document.getElementById('bboxTooltip');
  if (!preview || !tooltip) return;

  // Dismiss tooltip by tapping on it
  tooltip.addEventListener('click', (e) => {
    if (!isResponsiveTabMode()) return;
    e.preventDefault();
    e.stopPropagation();
    hideTooltip();
  });

  // Dismiss tooltip by tapping preview background (BBox has stopPropagation so it stays)
  preview.addEventListener('click', (e) => {
    if (!isResponsiveTabMode()) return;
    if (e.target?.closest?.('#bboxTooltip')) return;
    hideTooltip();
  });
}

function activateTab(target) {
  // Right pane: built-in + user tabs
  const tabs = Array.from(document.querySelectorAll('#resultTabs .tab[data-tab]'));
  for (const x of tabs) x.classList.remove('tab--active');
  const btn = tabs.find(t => t.dataset.tab === target);
  if (btn) btn.classList.add('tab--active');

  // Built-in panes
  document.getElementById('tab-summary').classList.toggle('tabpane--active', target === 'summary');
  document.getElementById('tab-items').classList.toggle('tabpane--active', target === 'items');
  document.getElementById('tab-json').classList.toggle('tabpane--active', target === 'json');
  document.getElementById('tab-requestJson').classList.toggle('tabpane--active', target === 'requestJson');

  // User tab panes
  const userPanes = document.querySelectorAll('.usertab-pane');
  userPanes.forEach(p => {
    p.classList.toggle('tabpane--active', p.id === `tab-${target}`);
  });
}

function decisionLabel(decision) {
  if (decision === 'valid') return tr('decision.valid');
  if (decision === 'invalid') return tr('decision.invalid');
  return tr('decision.unknown');
}

function _riskCountsFromFindings(findings) {
  const counts = { high: 0, medium: 0, low: 0, unknown: 0, total: 0 };
  const list = Array.isArray(findings) ? findings : [];
  for (const f of list) {
    const s = (f && f.severity) ? String(f.severity).toLowerCase() : 'unknown';
    if (s === 'high') counts.high++;
    else if (s === 'medium') counts.medium++;
    else if (s === 'low') counts.low++;
    else counts.unknown++;
    counts.total++;
  }
  return counts;
}

function _allFindingsFromReview(review) {
  const out = [];
  if (!review || !Array.isArray(review.agents)) return out;
  for (const a of review.agents) {
    const fs = Array.isArray(a?.findings) ? a.findings : [];
    for (const f of fs) out.push(f);
  }
  return out;
}

function _riskPct(n, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((n / total) * 100)));
}

function renderRiskProgress(counts, titleText) {
  const wrap = document.createElement('div');
  wrap.className = 'risk';

  const title = document.createElement('div');
  title.className = 'risk__title';
  title.textContent = titleText;
  wrap.appendChild(title);

  const total = counts.total;
  const rows = [
    { key: 'high', label: tr('risk.high'), value: counts.high },
    { key: 'medium', label: tr('risk.medium'), value: counts.medium },
    { key: 'low', label: tr('risk.low'), value: counts.low },
  ];

  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'risk__row';

    const lab = document.createElement('div');
    lab.className = `risk__label risk__label--${r.key}`;
    lab.textContent = r.label;

    const bar = document.createElement('div');
    bar.className = 'risk__bar';

    const fill = document.createElement('div');
    fill.className = `risk__fill risk__fill--${r.key}`;
    fill.style.width = `${_riskPct(r.value, total)}%`;
    bar.appendChild(fill);

    const meta = document.createElement('div');
    meta.className = 'risk__meta';
    meta.textContent = total ? `${r.value} (${_riskPct(r.value, total)}%)` : '-';

    row.appendChild(lab);
    row.appendChild(bar);
    row.appendChild(meta);
    wrap.appendChild(row);
  }

  const foot = document.createElement('div');
  foot.className = 'risk__foot';
  foot.textContent = total ? `${tr('label.total')}: ${total}` : `${tr('label.total')}: -`;
  wrap.appendChild(foot);

  return wrap;
}

function _hash32(s) {
  // deterministic 32-bit hash
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function openAncestorDetails(el) {
  let cur = el;
  while (cur) {
    if (cur.tagName && cur.tagName.toLowerCase() === 'details') {
      cur.open = true;
    }
    cur = cur.parentElement;
  }
}

function closeOtherDetails(targetEl) {
  const root = document.getElementById('itemsRoot');
  if (!root || !targetEl) return;

  const keep = new Set();
  let cur = targetEl;
  while (cur) {
    if (cur.tagName && cur.tagName.toLowerCase() === 'details') {
      keep.add(cur);
    }
    cur = cur.parentElement;
  }

  const all = Array.from(root.querySelectorAll('details'));
  for (const d of all) {
    if (!keep.has(d)) d.open = false;
  }
}

function scrollToItemAnchor(anchorId) {
  // This function is no longer used
  // BBox click in the preview now opens the JSON tab
  return;
}

function drawOverlayForPage(pageNumber) {
  clearOverlay();
  if (!currentResult) return;
  if (overlayMode === 'none') return;

  const page = diPageFor(pageNumber);
  if (!page || !page.width || !page.height) return;

  const { canvas, overlay } = getViewerElements();
  if (!canvas || !overlay) return;
  
  const canvasW = canvas.width;
  const canvasH = canvas.height;
  
  // Skip if canvas dimensions are invalid
  if (!canvasW || !canvasH || canvasW <= 0 || canvasH <= 0) return;
  
  overlay.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`);

  const pageW = page.width;
  const pageH = page.height;

  function addPath(polygon, cssClass, tooltipText, linkTargetId, jsonPath) {
    const pathD = polygonToPath(polygon, pageW, pageH, canvasW, canvasH);
    if (!pathD) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('class', cssClass);
    attachTooltipHandlers(path, tooltipText);
    if (linkTargetId) {
      path.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // In responsive (tab) mode, keep tooltip after tap
        if (isResponsiveTabMode()) {
          const safeText = (tooltipText || '').toString().trim();
          if (safeText) showTooltip(safeText, e.clientX, e.clientY);
        } else {
          hideTooltip();
        }
        
        // Open corresponding JSON viewer item
        if (jsonPath) {
          openJsonViewerPath(jsonPath);
        }
        // No longer scroll to items tab - JSON tab is opened instead
      });
    }
    overlay.appendChild(path);
  }

  if (overlayMode === 'lines' || overlayMode === 'words') {
    const items = overlayMode === 'words' ? (page.words || []) : (page.lines || []);
    const css = overlayMode === 'words' ? 'bbox bbox--words' : 'bbox bbox--lines';
    const n = Math.min(items.length, MAX_OVERLAY_SHAPES);
    const pageIdx = pageNumber - 1;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const targetId = overlayMode === 'lines' ? `item-line-${pageNumber}-${i}` : `item-page-${pageNumber}`;
      const jsonPath = overlayMode === 'lines' 
        ? ['pages', pageIdx, 'lines', i] 
        : ['pages', pageIdx, 'words', i];
      addPath(it.polygon, css, it.content, targetId, jsonPath);
    }
    return;
  }

  if (overlayMode === 'paragraphs') {
    if (!Array.isArray(currentResult.paragraphs)) return;
    const paragraphs = currentResult.paragraphs.filter(p => {
      const regions = p.boundingRegions || [];
      return regions.some(r => r.pageNumber === pageNumber);
    });
    const n = Math.min(paragraphs.length, MAX_OVERLAY_SHAPES);
    for (let i = 0; i < n; i++) {
      const para = paragraphs[i];
      const globalIndex = currentResult.paragraphs.indexOf(para);
      const regions = para.boundingRegions || [];
      for (const r of regions) {
        if (r.pageNumber !== pageNumber) continue;
        const content = para.content || '';
        const role = para.role ? ` (${para.role})` : '';
        const tooltip = tr('items.paragraphTooltip', {
          index: globalIndex,
          role,
          content,
        });
        const jsonPath = ['paragraphs', globalIndex];
        addPath(r.polygon, 'bbox bbox--paragraphs', tooltip, `item-paragraph-${globalIndex}`, jsonPath);
      }
    }
    return;
  }

  if (overlayMode === 'formulas') {
    const pageIdx = pageNumber - 1;
    const formulas = Array.isArray(page.formulas) ? page.formulas : [];
    const n = Math.min(formulas.length, MAX_OVERLAY_SHAPES);
    for (let i = 0; i < n; i++) {
      const f = formulas[i];
      const kind = f?.kind || '-';
      const value = f?.value ? String(f.value) : '';
      const tooltip = value
        ? tr('items.formulaTooltip', { kind, value })
        : tr('items.formulaTooltipNoValue', { kind });
      const jsonPath = ['pages', pageIdx, 'formulas', i];
      addPath(f.polygon, 'bbox bbox--formulas', tooltip, `item-formula-${pageNumber}-${i}`, jsonPath);
    }
    return;
  }

  if (overlayMode === 'barcodes') {
    const pageIdx = pageNumber - 1;
    const barcodes = Array.isArray(page.barcodes) ? page.barcodes : [];
    const n = Math.min(barcodes.length, MAX_OVERLAY_SHAPES);
    for (let i = 0; i < n; i++) {
      const b = barcodes[i];
      const kind = b?.kind || '-';
      const value = b?.value ? String(b.value) : '';
      const tooltip = value ? `Barcode (${kind})\n${value}` : `Barcode (${kind})`;
      const jsonPath = ['pages', pageIdx, 'barcodes', i];
      addPath(b.polygon, 'bbox bbox--barcodes', tooltip, `item-barcode-${pageNumber}-${i}`, jsonPath);
    }
    return;
  }

  if (overlayMode === 'figures') {
    const figures = Array.isArray(currentResult.figures) ? currentResult.figures : [];
    let count = 0;
    for (let i = 0; i < figures.length; i++) {
      if (count >= MAX_OVERLAY_SHAPES) break;
      const fig = figures[i];
      const captionText = fig?.caption?.content ? String(fig.caption.content) : '';
      const label = `Figure #${i + 1}${fig?.id ? ` (${fig.id})` : ''}`;
      const tooltip = captionText ? `${label}\n${captionText}` : label;
      const jsonPath = ['figures', i];

      const regions = Array.isArray(fig?.boundingRegions) ? fig.boundingRegions : [];
      for (const r of regions) {
        if (count >= MAX_OVERLAY_SHAPES) break;
        if (r.pageNumber !== pageNumber) continue;
        addPath(r.polygon, 'bbox bbox--figures', tooltip, `item-figure-${i}`, jsonPath);
        count++;
      }

      const captionRegions = Array.isArray(fig?.caption?.boundingRegions) ? fig.caption.boundingRegions : [];
      if (captionRegions.length && captionText) {
        const capTooltip = `${label} caption\n${captionText}`;
        for (const r of captionRegions) {
          if (count >= MAX_OVERLAY_SHAPES) break;
          if (r.pageNumber !== pageNumber) continue;
          addPath(r.polygon, 'bbox bbox--figures', capTooltip, `item-figure-${i}`, jsonPath);
          count++;
        }
      }
    }
    return;
  }

  if (overlayMode === 'selectionMarks') {
    const marks = page.selectionMarks || [];
    const n = Math.min(marks.length, MAX_OVERLAY_SHAPES);
    const pageIdx = pageNumber - 1;
    for (let i = 0; i < n; i++) {
      const m = marks[i];
      const jsonPath = ['pages', pageIdx, 'selectionMarks', i];
      addPath(
        m.polygon,
        'bbox bbox--selection',
        `selection: ${m.state ?? '-'} (conf=${m.confidence ?? '-'})`,
        `item-selection-${pageNumber}-${i}`,
        jsonPath
      );
    }
    return;
  }

  if (overlayMode === 'tables') {
    const tables = Array.isArray(currentResult.tables) ? currentResult.tables : [];
    let count = 0;
    for (let i = 0; i < tables.length; i++) {
      if (count >= MAX_OVERLAY_SHAPES) break;
      const t = tables[i];
      const regions = t.boundingRegions || [];
      for (const r of regions) {
        if (count >= MAX_OVERLAY_SHAPES) break;
        if (r.pageNumber !== pageNumber) continue;
        const jsonPath = ['tables', i];
        addPath(
          r.polygon,
          'bbox bbox--tables',
          `table #${i + 1} (${t.rowCount ?? '-'}x${t.columnCount ?? '-'})`,
          `item-table-${i}`,
          jsonPath
        );
        count++;
      }

      // Also draw cell bboxes (using DI tables.cells[].boundingRegions)
      const cells = Array.isArray(t.cells) ? t.cells : [];
      for (let ci = 0; ci < cells.length; ci++) {
        if (count >= MAX_OVERLAY_SHAPES) break;
        const cell = cells[ci];
        const cellRegions = cell.boundingRegions || [];
        for (const r of cellRegions) {
          if (count >= MAX_OVERLAY_SHAPES) break;
          if (r.pageNumber !== pageNumber) continue;
          const rIdx = cell.rowIndex ?? '-';
          const cIdx = cell.columnIndex ?? '-';
          const content = (cell.content || '').replace(/\s+/g, ' ').trim();
          const label = `table #${i + 1} r${rIdx} c${cIdx}${content ? `: ${content}` : ''}`;
          const cellJsonPath = ['tables', i, 'cells', ci];
          addPath(r.polygon, 'bbox bbox--tablecell', label, `item-table-${i}-cell-${rIdx}-${cIdx}`, cellJsonPath);
          count++;
        }
      }
    }
    return;
  }

  if (overlayMode === 'keyValuePairs') {
    const kvs = Array.isArray(currentResult.keyValuePairs) ? currentResult.keyValuePairs : [];
    let count = 0;
    for (let i = 0; i < kvs.length; i++) {
      if (count >= MAX_OVERLAY_SHAPES) break;
      const kv = kvs[i];
      const key = kv.key;
      const val = kv.value;
      const text = `${key?.content ?? '-'}: ${val?.content ?? '-'}`.replace(/\s+/g, ' ').trim();
      const link = `item-kv-${i}`;
      const jsonPath = ['keyValuePairs', i];

      const keyRegions = key?.boundingRegions || [];
      for (const r of keyRegions) {
        if (count >= MAX_OVERLAY_SHAPES) break;
        if (r.pageNumber !== pageNumber) continue;
        addPath(r.polygon, 'bbox bbox--kv', text, link, jsonPath);
        count++;
      }

      const valRegions = val?.boundingRegions || [];
      for (const r of valRegions) {
        if (count >= MAX_OVERLAY_SHAPES) break;
        if (r.pageNumber !== pageNumber) continue;
        addPath(r.polygon, 'bbox bbox--kv', text, link, jsonPath);
        count++;
      }
    }
    return;
  }
}

async function loadPdf(url) {
  if (window.__pdfjsReady) {
    await window.__pdfjsReady;
  }
  ensurePdfJs();
  pdfDoc = await window.pdfjsLib.getDocument(url).promise;
  currentPageNumber = 1;
  populatePageSelect(pdfDoc.numPages);
  setPageControlsEnabled(pdfDoc.numPages > 1);
}

function populatePageSelect(numPages) {
  const sel = document.getElementById('pageSelect');
  sel.innerHTML = '';
  for (let i = 1; i <= numPages; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = tr('preview.page', { n: i });
    sel.appendChild(opt);
  }
  sel.value = String(currentPageNumber);
}

async function renderPdfPage(pageNumber) {
  if (!pdfDoc) return;
  const { canvas } = getViewerElements();
  const page = await pdfDoc.getPage(pageNumber);

  // Scale to fit the preview pane width
  const preview = document.getElementById('preview');
  const maxW = Math.max(320, preview.clientWidth - 24);
  const viewport1 = page.getViewport({ scale: 1.0 });
  const scale = maxW / viewport1.width;
  const viewport = page.getViewport({ scale });

  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  drawOverlayForPage(pageNumber);
  saveUiState();
}

function renderImageWithOverlay(url) {
  const preview = document.getElementById('preview');
  if (!preview) return Promise.resolve({ ok: false, kind: 'image' });
  const keepIds = new Set(['busyOverlay', 'bboxTooltip']);
  Array.from(preview.children).forEach((child) => {
    if (!keepIds.has(child.id)) child.remove();
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'viewer';

  const img = document.createElement('img');
  img.src = url;
  img.alt = currentDocument?.filename || 'image';
  img.style.display = 'block';
  img.style.width = '100%';
  img.style.height = 'auto';

  const canvas = document.createElement('canvas');
  canvas.className = 'viewer__canvas';
  canvas.id = 'pdfCanvas';
  canvas.style.display = 'none';

  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.classList.add('viewer__overlay');
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.setAttribute('id', 'overlaySvg');

  wrapper.appendChild(img);
  wrapper.appendChild(canvas);
  wrapper.appendChild(overlay);
  preview.prepend(wrapper);

  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => {
      // Set canvas to the actual image dimensions
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      overlay.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
      // For images, DI's coordinate system may not be in pixels, so only draw bbox when page width/height are available
      if (currentResult) {
        drawOverlayForPage(1);
      }
      resolve({ ok: true, kind: 'image' });
    }, { once: true });

    img.addEventListener('error', () => {
      reject(new Error(tr('error.imageLoadFailed')));
    }, { once: true });
  });
}

async function renderPreview(doc) {
  const preview = document.getElementById('preview');
  // Keep busyOverlay / tooltip while recreating viewer/hint only
  const keepIds = new Set(['busyOverlay', 'bboxTooltip']);
  Array.from(preview.children).forEach((child) => {
    if (!keepIds.has(child.id)) child.remove();
  });

  // Clear media viewer
  const mediaViewer = document.getElementById('mediaViewer');
  if (mediaViewer) {
    mediaViewer.innerHTML = `<div class="hint" data-i18n="media.hint">${tr('media.hint')}</div>`;
  }

  // Show/hide media tab
  const mediaTab = document.querySelector('.tab[data-preview-tab="media"]');

  pdfDoc = null;
  setPageControlsEnabled(false);

  if (!doc) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.dataset.i18n = 'preview.hint';
    hint.textContent = tr('preview.hint');
    preview.prepend(hint);
    setOverlayControlsEnabled(false);
    if (mediaTab) { mediaTab.style.display = 'none'; }
    return { ok: true, kind: 'empty' };
  }

  // Enable bbox overlay only after analysis results are available
  setOverlayControlsEnabled(!!currentResult);

  try {
    // Audio/Video files → media player
    if (isMediaFile(doc.contentType, doc.filename)) {
      if (mediaTab) { mediaTab.style.display = ''; }
      const isAudio = isAudioFile(doc.contentType, doc.filename);
      const el = document.createElement(isAudio ? 'audio' : 'video');
      el.controls = true;
      el.src = doc.url;
      if (!isAudio) {
        el.style.maxWidth = '100%';
        el.style.maxHeight = '480px';
      }
      if (mediaViewer) {
        mediaViewer.innerHTML = '';
        mediaViewer.appendChild(el);
      }
      activatePreviewTab('media');

      // Also put a hint in the main preview area
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = tr('preview.tabs.media');
      preview.prepend(hint);
      return { ok: true, kind: isAudio ? 'audio' : 'video' };
    }

    if (mediaTab) { mediaTab.style.display = 'none'; }

    if (isPdf(doc.contentType, doc.filename)) {
      getViewerElements();
      await loadPdf(doc.url);
      await renderPdfPage(currentPageNumber);
      return { ok: true, kind: 'pdf' };
    }

    await renderImageWithOverlay(doc.url);
    return { ok: true, kind: 'image' };
  } catch (err) {
    console.error('renderPreview failed', err);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.dataset.i18n = 'preview.failed';
    hint.textContent = tr('preview.failed');
    preview.prepend(hint);
    return { ok: false, error: err };
  }
}

async function checkCacheExists() {
  if (!currentDocument) {
    setCacheInfo('');
    return;
  }
  const modelId = getModelId();
  if (!modelId) {
    setCacheInfo('');
    return;
  }
  try {
    const options = collectAnalyzeOptions();
    // CU cache uses "cu:" prefix on server side
    const cacheModelId = currentService === 'cu' ? `cu:v4:${modelId}` : modelId;
    const res = await fetch('/api/cache/exists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileHash: currentDocument.fileHash, modelId: cacheModelId, options }),
    });
    const data = await res.json();
    if (res.ok && data.exists) {
      setCacheInfo(tr('cache.hit'));
    } else {
      setCacheInfo('');
    }
  } catch {
    setCacheInfo('');
  }
}

function summarizeResult(result) {
  const lines = [];
  const pages = result.pages ? result.pages.length : 0;
  const tables = result.tables ? result.tables.length : 0;
  const documents = result.documents ? result.documents.length : 0;
  const kv = result.keyValuePairs ? result.keyValuePairs.length : 0;

  lines.push(`${tr('summary.modelId')}: ${result.modelId ?? '-'}`);
  lines.push(`${tr('summary.pages')}: ${pages}`);
  lines.push(`${tr('summary.documents')}: ${documents}`);
  lines.push(`${tr('summary.tables')}: ${tables}`);
  lines.push(`${tr('summary.keyValuePairs')}: ${kv}`);

  // Brief per-page summary
  if (Array.isArray(result.pages)) {
    for (const p of result.pages) {
      const n = p.pageNumber ?? '?';
      const l = p.lines ? p.lines.length : 0;
      const w = p.words ? p.words.length : 0;
      lines.push(tr('summary.pageLine', { n, lines: l, words: w }));
    }
  }

  return lines.join('\n');
}

// ── Content Understanding result helpers ──────────────────────

function summarizeCuResult(result, normalizedResult = null) {
  const raw = result?.result || result || {};
  const normalized = normalizedResult || normalizeCuResultForUi(result);
  const lines = [];
  lines.push(`${tr('cu.summary.analyzerId')}: ${raw.analyzerId ?? raw.analyzer_id ?? '-'}`);
  lines.push(`${tr('cu.summary.status')}: ${raw.status ?? result?.status ?? '-'}`);
  const contents = raw.contents || [];
  lines.push(`${tr('cu.summary.contents')}: ${contents.length}`);
  lines.push(`${tr('summary.pages')}: ${Array.isArray(normalized.pages) ? normalized.pages.length : 0}`);
  lines.push(`${tr('structure.paragraphs')}: ${Array.isArray(normalized.paragraphs) ? normalized.paragraphs.length : 0}`);
  lines.push(`${tr('items.section.tables')}: ${Array.isArray(normalized.tables) ? normalized.tables.length : 0}`);

  for (let i = 0; i < contents.length; i++) {
    const c = contents[i];
    const kind = c.kind || '?';
    const path = c.path || '';
    const hasFields = c.fields && Object.keys(c.fields).length > 0;
    const hasMd = !!c.markdown;
    lines.push(`  [${i}] kind=${kind} path=${path} fields=${hasFields ? Object.keys(c.fields).length : 0} markdown=${hasMd ? 'yes' : 'no'}`);
  }

  return lines.join('\n');
}

function parseCuSourceRegions(source) {
  if (!source || typeof source !== 'string') return [];

  return source
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = /^D\(([^)]+)\)$/.exec(part);
      if (!match) return [];

      const values = match[1].split(',').map(v => v.trim()).filter(Boolean);
      if (values.length < 9) return [];

      const pageNumber = parseInt(values[0], 10);
      const polygon = values.slice(1).map(Number);
      if (!Number.isFinite(pageNumber) || polygon.length < 8 || polygon.some(v => !Number.isFinite(v))) return [];

      return [{ pageNumber, polygon }];
    });
}

function normalizeCuRegions(source) {
  return parseCuSourceRegions(source).map(region => ({
    pageNumber: region.pageNumber,
    polygon: region.polygon,
  }));
}

function firstCuPolygon(source) {
  const region = parseCuSourceRegions(source)[0];
  return region ? region.polygon : null;
}

function normalizeCuResultForUi(result) {
  const raw = result?.result || result || {};
  const contents = Array.isArray(raw.contents) ? raw.contents : [];
  const documentContent = contents.find(c => c?.kind === 'document') || contents[0] || null;

  if (!documentContent || documentContent.kind !== 'document') {
    return {
      modelId: raw.analyzerId || '-',
      contentFormat: 'markdown',
      content: contents.map(c => c?.markdown || '').filter(Boolean).join('\n\n---\n\n'),
      pages: [],
      paragraphs: [],
      sections: [],
      tables: [],
      figures: [],
      keyValuePairs: [],
    };
  }

  const pages = (documentContent.pages || []).map(page => ({
    pageNumber: page.pageNumber ?? page.page_number,
    width: page.width,
    height: page.height,
    words: (page.words || []).map(word => ({
      content: word.content,
      confidence: word.confidence,
      polygon: firstCuPolygon(word.source),
      source: word.source,
      span: word.span,
    })),
    lines: (page.lines || []).map(line => ({
      content: line.content,
      polygon: firstCuPolygon(line.source),
      source: line.source,
      span: line.span,
    })),
    barcodes: (page.barcodes || []).map(barcode => ({
      kind: barcode.kind,
      value: barcode.value,
      polygon: firstCuPolygon(barcode.source),
      source: barcode.source,
      span: barcode.span,
      confidence: barcode.confidence,
    })),
    formulas: (page.formulas || []).map(formula => ({
      kind: formula.kind,
      value: formula.value,
      polygon: firstCuPolygon(formula.source),
      source: formula.source,
      span: formula.span,
      confidence: formula.confidence,
    })),
  }));

  const paragraphs = (documentContent.paragraphs || []).map(paragraph => ({
    role: paragraph.role,
    content: paragraph.content,
    span: paragraph.span,
    source: paragraph.source,
    boundingRegions: normalizeCuRegions(paragraph.source),
  }));

  const sections = (documentContent.sections || []).map(section => ({
    span: section.span,
    elements: Array.isArray(section.elements) ? section.elements.slice() : [],
  }));

  const tables = (documentContent.tables || []).map(table => ({
    rowCount: table.rowCount ?? table.row_count,
    columnCount: table.columnCount ?? table.column_count,
    role: table.role,
    span: table.span,
    source: table.source,
    boundingRegions: normalizeCuRegions(table.source),
    caption: table.caption,
    footnotes: table.footnotes,
    cells: (table.cells || []).map(cell => ({
      kind: cell.kind,
      rowIndex: cell.rowIndex ?? cell.row_index,
      columnIndex: cell.columnIndex ?? cell.column_index,
      rowSpan: cell.rowSpan ?? cell.row_span,
      columnSpan: cell.columnSpan ?? cell.column_span,
      content: cell.content,
      span: cell.span,
      source: cell.source,
      elements: Array.isArray(cell.elements) ? cell.elements.slice() : [],
      boundingRegions: normalizeCuRegions(cell.source),
    })),
  }));

  const figures = (documentContent.figures || []).map((figure, index) => ({
    id: figure.id || `figure-${index}`,
    kind: figure.kind,
    boundingRegions: normalizeCuRegions(figure.source),
    caption: figure.caption,
    description: figure.description,
  }));

  return {
    modelId: raw.analyzerId || '-',
    contentFormat: 'markdown',
    content: documentContent.markdown || '',
    pages,
    paragraphs,
    sections,
    tables,
    figures,
    keyValuePairs: [],
  };
}

function renderCuItems(result) {
  const root = document.getElementById('itemsRoot');
  if (!root) return;

  const data = result.result || result || {};
  const contents = Array.isArray(data.contents) ? data.contents : [];
  const normalized = normalizeCuResultForUi(result);

  renderItems(normalized);

  if (contents.length === 0) return;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < contents.length; i++) {
    const content = contents[i];
    const section = document.createElement('details');
    section.open = i === 0;

    const summary = document.createElement('summary');
    summary.textContent = tr('cu.contentSummary', {
      index: i,
      kind: content.kind || tr('common.unknown'),
      path: content.path || '-',
    });
    summary.style.fontWeight = '600';
    summary.style.marginBottom = '8px';
    section.appendChild(summary);

    const meta = document.createElement('div');
    meta.className = 'hint';
    const pageRange = content.startPageNumber != null && content.endPageNumber != null
      ? `${content.startPageNumber}-${content.endPageNumber}`
      : '-';
    const markdownLength = (content.markdown || '').length;
    const fieldCount = Object.keys(content.fields || {}).length;
    meta.textContent = tr('cu.contentMeta', {
      mime: content.mimeType || '-',
      pages: pageRange,
      chars: markdownLength,
      fields: fieldCount,
    });
    meta.style.marginBottom = '8px';
    section.appendChild(meta);

    const fields = content.fields || {};
    const fieldKeys = Object.keys(fields);
    if (fieldKeys.length > 0) {
      const fieldTitle = document.createElement('div');
      fieldTitle.textContent = tr('cu.fields');
      fieldTitle.style.fontWeight = '600';
      fieldTitle.style.fontSize = '13px';
      fieldTitle.style.marginBottom = '6px';
      fieldTitle.style.marginTop = '8px';
      section.appendChild(fieldTitle);

      for (const key of fieldKeys) {
        const field = fields[key];
        const row = document.createElement('div');
        row.className = 'cu-field';
        row.tabIndex = 0;
        row.role = 'button';
        row.style.cursor = 'pointer';

        const nameEl = document.createElement('span');
        nameEl.className = 'cu-field__name';
        nameEl.textContent = key;
        row.appendChild(nameEl);

        const valueEl = document.createElement('span');
        valueEl.className = 'cu-field__value';
        valueEl.textContent = _cuFieldValue(field);
        row.appendChild(valueEl);

        if (field.confidence != null) {
          const confEl = document.createElement('span');
          const conf = field.confidence;
          const level = conf >= 0.8 ? 'high' : conf >= 0.5 ? 'medium' : 'low';
          confEl.className = `cu-field__confidence cu-field__confidence--${level}`;
          confEl.textContent = `${(conf * 100).toFixed(1)}%`;
          confEl.title = tr('cu.confidence');
          row.appendChild(confEl);
        }

        const jsonPath = ['contents', i, 'fields', key];
        row.addEventListener('click', () => openJsonViewerPath(jsonPath));
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openJsonViewerPath(jsonPath);
          }
        });

        section.appendChild(row);
      }
    } else {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = tr('cu.contentStats', {
        message: tr('cu.noFields'),
        pages: normalized.pages.length,
        paragraphs: normalized.paragraphs.length,
        tables: normalized.tables.length,
      });
      section.appendChild(empty);
    }

    fragment.appendChild(section);
  }

  root.prepend(fragment);
}

function _cuFieldValue(field) {
  if (field == null) return '';
  // Try common value patterns from CU API
  if (field.valueString != null) return String(field.valueString);
  if (field.value_string != null) return String(field.value_string);
  if (field.valueNumber != null) return String(field.valueNumber);
  if (field.value_number != null) return String(field.value_number);
  if (field.valueDate != null) return String(field.valueDate);
  if (field.value_date != null) return String(field.value_date);
  if (field.value != null) return typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value);
  if (field.valueObject != null) return JSON.stringify(field.valueObject);
  if (field.value_object != null) return JSON.stringify(field.value_object);
  if (field.valueArray != null) return `[${field.valueArray.length} items]`;
  if (field.value_array != null) return `[${field.value_array.length} items]`;
  // Fallback
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  return JSON.stringify(field);
}

function renderCuMarkdownPreview(result) {
  const viewer = document.getElementById('markdownViewer');
  const tab = document.querySelector('.tab[data-preview-tab="markdown"]');
  const rawTab = document.querySelector('.tab[data-preview-tab="raw"]');
  const rawViewer = document.getElementById('rawViewer');

  // Collect all markdown from CU contents
  const data = result.result || result;
  const contents = data.contents || [];
  const mdParts = contents.map(c => c.markdown || '').filter(Boolean);
  const markdown = mdParts.join('\n\n---\n\n');

  const hasContent = !!markdown;

  if (tab) {
    tab.disabled = !hasContent;
    tab.classList.toggle('tab--disabled', !hasContent);
  }
  if (rawTab) {
    rawTab.disabled = !hasContent;
    rawTab.classList.toggle('tab--disabled', !hasContent);
  }

  if (hasContent && viewer && window.marked) {
    try {
      const html = window.marked.parse(markdown);
      viewer.innerHTML = `<div class="markdown-body">${html}</div>`;
    } catch {
      viewer.innerHTML = `<div class="hint">${tr('alert.markdownRenderFailed')}</div>`;
    }
  } else if (viewer) {
    viewer.innerHTML = `<div class="hint">${tr('markdown.hint')}</div>`;
  }

  if (rawViewer) {
    rawViewer.textContent = hasContent ? markdown : tr('raw.hint');
  }

  // If markdown is available, switch to markdown preview
  if (hasContent) {
    activatePreviewTab('markdown');
  }
}

// ── Service Selector ──────────────────────────────────────────

function initServiceSelector() {
  const selector = document.getElementById('serviceSelector');
  if (!selector) return;

  // Hide CU button if not enabled
  if (!CU_ENABLED) {
    const cuBtn = selector.querySelector('[data-service="cu"]');
    if (cuBtn) {
      cuBtn.disabled = true;
      cuBtn.title = tr('service.cuDisabled');
      cuBtn.style.opacity = '0.4';
      cuBtn.style.cursor = 'not-allowed';
    }
  }

  const buttons = selector.querySelectorAll('.service-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const service = btn.dataset.service;
      if (service === 'cu' && !CU_ENABLED) return;
      if (service === currentService) return;
      switchService(service);
    });
  });
}

async function switchService(service) {
  currentService = service;

  // Update selector UI
  const selector = document.getElementById('serviceSelector');
  selector.querySelectorAll('.service-btn').forEach(btn => {
    btn.classList.toggle('service-btn--active', btn.dataset.service === service);
  });

  applyAppTitle(service);

  // Toggle DI-specific options visibility
  const diOptions = document.getElementById('diOptionsGroup');
  const cuOptions = document.getElementById('cuOptionsGroup');
  const diCustomModel = document.getElementById('fieldCustomModelId');
  const diHintCustomModel = document.getElementById('diHintCustomModel');
  if (diOptions) diOptions.style.display = service === 'cu' ? 'none' : '';
  if (cuOptions) cuOptions.style.display = service === 'cu' ? '' : 'none';
  if (diCustomModel) diCustomModel.style.display = service === 'cu' ? 'none' : '';
  if (diHintCustomModel) diHintCustomModel.style.display = service === 'cu' ? 'none' : '';

  // Reload models for the selected service
  await loadModels();

  // Update field schema section visibility
  _updateFieldSchemaVisibility();

  // Reset cache info 
  setCacheInfo('');
}

function isMediaFile(contentType, filename) {
  if (!contentType && !filename) return false;
  const ct = (contentType || '').toLowerCase();
  const fn = (filename || '').toLowerCase();
  if (ct.startsWith('audio/') || ct.startsWith('video/')) return true;
  const mediaExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.mp4', '.avi', '.mov', '.mkv', '.webm'];
  return mediaExts.some(ext => fn.endsWith(ext));
}

function isAudioFile(contentType, filename) {
  const ct = (contentType || '').toLowerCase();
  const fn = (filename || '').toLowerCase();
  if (ct.startsWith('audio/')) return true;
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'];
  return audioExts.some(ext => fn.endsWith(ext));
}

// ────────────────────────────────────────────────────────────────

function downloadJson(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderItems(result) {
  const root = document.getElementById('itemsRoot');
  root.innerHTML = '';

  function makeDetails(title, build, options = {}) {
    const { eager = false } = options;
    const d = document.createElement('details');
    const s = document.createElement('summary');
    s.textContent = title;
    d.appendChild(s);
    let built = false;
    d.addEventListener('toggle', () => {
      if (!d.open || built) return;
      built = true;
      build(d);
    });

    if (eager && !built) {
      built = true;
      build(d);
    }
    return d;
  }

  const meta = document.createElement('div');
  meta.className = 'kv';
  meta.textContent = `${tr('summary.modelId')}: ${result.modelId ?? '-'}\n${tr('items.meta.apiVersion')}: ${result.apiVersion ?? '-'}\n${tr('items.meta.contentLength')}: ${(result.content || '').length}`;
  root.appendChild(meta);

  root.appendChild(
    makeDetails(`${tr('items.section.pages')} (${Array.isArray(result.pages) ? result.pages.length : 0})`, (container) => {
      if (!Array.isArray(result.pages) || result.pages.length === 0) {
        container.appendChild(document.createTextNode(tr('items.noPages')));
        return;
      }
      for (const p of result.pages) {
        const pn = p.pageNumber ?? '?';
        const lines = Array.isArray(p.lines) ? p.lines.length : 0;
        const words = Array.isArray(p.words) ? p.words.length : 0;

        const pageDetails = makeDetails(tr('items.pageDetails', { page: pn, lines, words }), (pd) => {
          const btn = document.createElement('button');
          btn.className = 'btn btn--small';
          btn.type = 'button';
          btn.textContent = tr('items.showThisPage');
          btn.addEventListener('click', async () => {
            if (pdfDoc) {
              currentPageNumber = pn;
              document.getElementById('pageSelect').value = String(pn);
              await renderPdfPage(currentPageNumber);
            } else {
              // Treat image as single page
              drawOverlayForPage(1);
            }
          });
          pd.appendChild(btn);

          const btnLines = document.createElement('button');
          btnLines.className = 'btn btn--small';
          btnLines.type = 'button';
          btnLines.textContent = tr('items.linesBBox');
          btnLines.addEventListener('click', async () => {
            overlayMode = 'lines';
            document.getElementById('overlaySelect').value = overlayMode;
            if (pdfDoc) {
              currentPageNumber = pn;
              document.getElementById('pageSelect').value = String(pn);
              await renderPdfPage(currentPageNumber);
            } else {
              drawOverlayForPage(1);
            }
            saveUiState();
          });
          pd.appendChild(btnLines);

          const btnWords = document.createElement('button');
          btnWords.className = 'btn btn--small';
          btnWords.type = 'button';
          btnWords.textContent = tr('items.wordsBBox');
          btnWords.addEventListener('click', async () => {
            overlayMode = 'words';
            document.getElementById('overlaySelect').value = overlayMode;
            if (pdfDoc) {
              currentPageNumber = pn;
              document.getElementById('pageSelect').value = String(pn);
              await renderPdfPage(currentPageNumber);
            } else {
              drawOverlayForPage(1);
            }
            saveUiState();
          });
          pd.appendChild(btnWords);

          const info = document.createElement('div');
          info.className = 'kv';
          info.textContent = tr('items.pageMetrics', {
            width: p.width ?? '-',
            height: p.height ?? '-',
            unit: p.unit ?? '-',
          });
          pd.appendChild(info);

          pd.appendChild(
            makeDetails(tr('items.linesFirst', { n: MAX_LIST }), (ld) => {
              if (!Array.isArray(p.lines) || p.lines.length === 0) {
                ld.appendChild(document.createTextNode(tr('items.noLines')));
                return;
              }
              // Output all lines without truncation (for BBox click to jump to the corresponding line)
              const list = document.createElement('div');
              const frag = document.createDocumentFragment();
              for (let i = 0; i < p.lines.length; i++) {
                const line = p.lines[i];
                const content = (line.content || '').replace(/\s+/g, ' ').trim();
                const row = document.createElement('div');
                row.className = 'kvline';
                row.id = `item-line-${pn}-${i}`;
                row.textContent = `${i + 1}. ${content}`;
                frag.appendChild(row);
              }
              list.appendChild(frag);
              ld.appendChild(list);
            })
          );
        });

        // BBox click navigation target (per page)
        pageDetails.id = `item-page-${pn}`;

        container.appendChild(pageDetails);
      }
    }, { eager: true })
  );

  root.appendChild(
    makeDetails(`${tr('items.section.documents')} (${Array.isArray(result.documents) ? result.documents.length : 0})`, (container) => {
      if (!Array.isArray(result.documents) || result.documents.length === 0) {
        container.appendChild(document.createTextNode(tr('items.noDocuments')));
        return;
      }

      for (let i = 0; i < result.documents.length; i++) {
        const doc = result.documents[i];
        const dt = doc.docType ?? '-';
        const conf = doc.confidence ?? '-';
        const d = makeDetails(tr('items.documentDetails', { index: i + 1, type: dt, confidence: conf }), (dd) => {
          const fields = doc.fields || {};
          const keys = Object.keys(fields);
          const n = Math.min(keys.length, MAX_LIST);
          const rows = [];
          for (let k = 0; k < n; k++) {
            const name = keys[k];
            const f = fields[name];
            const content = (f?.content || f?.valueString || f?.value || '').toString().replace(/\s+/g, ' ').trim();
            const fconf = f?.confidence;
            rows.push(`${name}: ${content}${fconf !== undefined ? ` (conf=${fconf})` : ''}`);
          }
          if (keys.length > n) rows.push(tr('items.more', { n: keys.length - n }));
          const pre = document.createElement('div');
          pre.className = 'kv';
          pre.textContent = rows.join('\n');
          dd.appendChild(pre);
        });
        container.appendChild(d);
      }
    })
  );

  root.appendChild(
    makeDetails(`${tr('items.section.tables')} (${Array.isArray(result.tables) ? result.tables.length : 0})`, (container) => {
      if (!Array.isArray(result.tables) || result.tables.length === 0) {
        container.appendChild(document.createTextNode(tr('items.noTables')));
        return;
      }
      for (let i = 0; i < result.tables.length; i++) {
        const t = result.tables[i];
        const r = t.rowCount ?? '-';
        const c = t.columnCount ?? '-';
        const page = t.boundingRegions?.[0]?.pageNumber ?? '-';
        const tableDetails = makeDetails(tr('items.tableDetails', { index: i + 1, page, rows: r, cols: c }), (td) => {
          const btn = document.createElement('button');
          btn.className = 'btn btn--small';
          btn.type = 'button';
          btn.textContent = tr('items.tablesCellsBBox');
          btn.addEventListener('click', async () => {
            overlayMode = 'tables';
            document.getElementById('overlaySelect').value = overlayMode;
            if (pdfDoc && typeof page === 'number') {
              currentPageNumber = page;
              document.getElementById('pageSelect').value = String(page);
              await renderPdfPage(currentPageNumber);
            } else {
              drawOverlayForPage(currentPageNumber);
            }
            saveUiState();
          });
          td.appendChild(btn);

          const info = document.createElement('div');
          info.className = 'kv';
          const brCount = Array.isArray(t.boundingRegions) ? t.boundingRegions.length : 0;
          const cellCount = Array.isArray(t.cells) ? t.cells.length : 0;
          info.textContent = tr('items.tableMetrics', { regions: brCount, cells: cellCount });
          td.appendChild(info);

          td.appendChild(
            makeDetails(tr('items.cells'), (cd) => {
              if (!Array.isArray(t.cells) || t.cells.length === 0) {
                cd.appendChild(document.createTextNode(tr('items.noCells')));
                return;
              }
              const n = Math.min(t.cells.length, 400);
              for (let ci = 0; ci < n; ci++) {
                const cell = t.cells[ci];
                const rIdx = cell.rowIndex ?? '-';
                const cIdx = cell.columnIndex ?? '-';
                const kind = cell.kind ? ` (${cell.kind})` : '';
                const content = (cell.content || '').replace(/\s+/g, ' ').trim();
                const line = document.createElement('div');
                line.className = 'kv';
                line.id = `item-table-${i}-cell-${rIdx}-${cIdx}`;
                line.textContent = `r${rIdx} c${cIdx}${kind}: ${content || '-'}`;
                cd.appendChild(line);
              }
              if (t.cells.length > n) {
                const more = document.createElement('div');
                more.className = 'kv';
                more.textContent = tr('items.more', { n: t.cells.length - n });
                cd.appendChild(more);
              }
            }, { eager: true })
          );
        }, { eager: true });

        // BBox click navigation target (per table)
        tableDetails.id = `item-table-${i}`;
        container.appendChild(tableDetails);
      }
    }, { eager: true })
  );

  root.appendChild(
    makeDetails(`${tr('items.section.keyValuePairs')} (${Array.isArray(result.keyValuePairs) ? result.keyValuePairs.length : 0})`, (container) => {
      if (!Array.isArray(result.keyValuePairs) || result.keyValuePairs.length === 0) {
        container.appendChild(document.createTextNode(tr('items.noKeyValuePairs')));
        return;
      }
      const n = Math.min(result.keyValuePairs.length, MAX_LIST);
      for (let i = 0; i < n; i++) {
        const kv = result.keyValuePairs[i];
        const k = kv.key?.content?.replace(/\s+/g, ' ').trim() || '-';
        const v = kv.value?.content?.replace(/\s+/g, ' ').trim() || '-';
        const row = document.createElement('div');
        row.className = 'kv';
        row.id = `item-kv-${i}`;
        row.textContent = `${k}: ${v}`;
        container.appendChild(row);
      }
      if (result.keyValuePairs.length > n) {
        const more = document.createElement('div');
        more.className = 'kv';
        more.textContent = tr('items.more', { n: result.keyValuePairs.length - n });
        container.appendChild(more);
      }
    }, { eager: true })
  );

  // Show SelectionMarks as BBox click link targets if present
  root.appendChild(
    makeDetails(`${tr('items.section.selectionMarks')} (${Array.isArray(result.pages) ? result.pages.reduce((acc, p) => acc + ((p.selectionMarks || []).length), 0) : 0})`, (container) => {
      if (!Array.isArray(result.pages) || result.pages.length === 0) {
        container.appendChild(document.createTextNode(tr('items.noPages')));
        return;
      }
      for (const p of result.pages) {
        const pn = p.pageNumber ?? '?';
        const marks = p.selectionMarks || [];
        if (!Array.isArray(marks) || marks.length === 0) continue;

        const d = makeDetails(tr('items.selectionPage', { page: pn, count: marks.length }), (pd) => {
          const n = Math.min(marks.length, MAX_LIST);
          for (let i = 0; i < n; i++) {
            const m = marks[i];
            const row = document.createElement('div');
            row.className = 'kv';
            row.id = `item-selection-${pn}-${i}`;
            row.textContent = tr('items.selectionRow', {
              index: i + 1,
              state: m.state ?? '-',
              confidence: m.confidence ?? '-',
            });
            pd.appendChild(row);
          }
          if (marks.length > n) {
            const more = document.createElement('div');
            more.className = 'kv';
            more.textContent = tr('items.more', { n: marks.length - n });
            pd.appendChild(more);
          }
        });
        container.appendChild(d);
      }
    }, { eager: true })
  );
}

function clearUiForNewUpload() {
  // Clear stale analysis results and overlay from previous file
  currentJobId = null;
  currentResult = null;
  currentJsonResult = null;
  currentRequestPayload = null;
  currentModelId = null;
  currentOutputContentFormat = '';
  overlayMode = 'lines';
  currentPageNumber = 1;

  document.getElementById('jobInfo').textContent = '-';
  document.getElementById('summaryText').textContent = '-';
  const jsonViewer = document.getElementById('jsonViewer');
  if (jsonViewer) {
    jsonViewer.innerHTML = `<div class="hint">${tr('json.hint')}</div>`;
    document.getElementById('expandAllBtn').disabled = true;
    document.getElementById('collapseAllBtn').disabled = true;
  }
  document.getElementById('itemsRoot').innerHTML = `<div class="hint">${tr('items.hint')}</div>`;
  document.getElementById('downloadJsonBtn').disabled = true;
  const requestJsonViewer = document.getElementById('requestJsonViewer');
  if (requestJsonViewer) {
    requestJsonViewer.innerHTML = `<div class="hint">${tr('json.requestHint')}</div>`;
    document.getElementById('expandAllRequestJsonBtn').disabled = true;
    document.getElementById('collapseAllRequestJsonBtn').disabled = true;
    document.getElementById('downloadRequestJsonBtn').disabled = true;
  }
  const structureViewer = document.getElementById('structureViewer');
  if (structureViewer) structureViewer.innerHTML = `<div class="hint">${tr('structure.hint')}</div>`;
  const markdownViewer = document.getElementById('markdownViewer');
  if (markdownViewer) markdownViewer.innerHTML = `<div class="hint">${tr('markdown.hint')}</div>`;
  const rawViewer = document.getElementById('rawViewer');
  if (rawViewer) rawViewer.textContent = tr('raw.hint');

  const mdTab = document.querySelector('.tab[data-preview-tab="markdown"]');
  if (mdTab) {
    mdTab.disabled = true;
    mdTab.classList.add('tab--disabled');
  }
  const rawTab = document.querySelector('.tab[data-preview-tab="raw"]');
  if (rawTab) {
    rawTab.disabled = true;
    rawTab.classList.add('tab--disabled');
  }

  const overlaySel = document.getElementById('overlaySelect');
  overlayMode = 'lines';
  overlaySel.value = overlayMode;
  setOverlayControlsEnabled(false);
  setPageControlsEnabled(false);
  clearOverlay();
  hideTooltip();
  setCacheInfo('');
  setBusy(false);
  syncUploadButtonMode();
}

/* ── Rich Model Picker ── */
let _pickerModels = [];   // [{id, cat, us}]
let _pickerSelected = ''; // currently selected model id

function _pickerCategoryOrder() {
  // Order categories logically per service
  if (currentService === 'cu') {
    return ['extraction', 'base', 'rag', 'financial', 'identity', 'tax', 'mortgage', 'legal', 'procurement', 'other', 'utility'];
  }
  return ['analysis', 'financial', 'identity', 'tax', 'mortgage'];
}

function _renderPickerList() {
  const list = document.getElementById('modelPickerList');
  if (!list) return;
  const filterText = (document.getElementById('modelFilterInput')?.value || '').toLowerCase();
  const showUs = document.getElementById('modelUsCheckbox')?.checked ?? false;

  // Filter models
  const visible = _pickerModels.filter((m) => {
    if (m.us && !showUs) return false;
    if (filterText) {
      const label = getModelDisplayLabel(m.id).toLowerCase();
      const id = m.id.toLowerCase();
      if (!label.includes(filterText) && !id.includes(filterText)) return false;
    }
    return true;
  });

  // Group by category
  const groups = new Map();
  for (const m of visible) {
    const cat = m.cat || 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(m);
  }

  list.innerHTML = '';
  if (visible.length === 0) {
    list.innerHTML = `<div class="model-picker__empty">${tr('model.empty')}</div>`;
    return;
  }

  const catOrder = _pickerCategoryOrder();
  const sortedCats = [...groups.keys()].sort((a, b) => {
    const ia = catOrder.indexOf(a);
    const ib = catOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  for (const cat of sortedCats) {
    const models = groups.get(cat);
    // Category header
    const hdr = document.createElement('div');
    hdr.className = 'model-picker__cat';
    hdr.textContent = tr(`model.cat.${cat}`) || cat;
    list.appendChild(hdr);
    // Items
    for (const m of models) {
      const item = document.createElement('div');
      item.className = 'model-picker__item';
      if (m.id === _pickerSelected) item.classList.add('model-picker__item--selected');
      item.dataset.modelId = m.id;
      const label = document.createElement('span');
      label.textContent = getModelDisplayLabel(m.id);
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      item.appendChild(label);
      if (m.us) {
        const badge = document.createElement('span');
        badge.className = 'model-picker__us-badge';
        badge.textContent = 'US';
        item.appendChild(badge);
      }
      if (m.needsSchema) {
        const badge = document.createElement('span');
        badge.className = 'model-picker__schema-badge';
        badge.textContent = tr('model.needsSchema');
        item.appendChild(badge);
      }
      item.addEventListener('click', () => _selectPickerModel(m.id));
      list.appendChild(item);
    }
  }
}

function _selectPickerModel(modelId) {
  _pickerSelected = modelId;
  // Update hidden select
  const select = document.getElementById('modelSelect');
  if (select) {
    select.value = modelId;
    select.dispatchEvent(new Event('change'));
  }
  // Update button label
  const btn = document.getElementById('modelPickerLabel');
  if (btn) btn.textContent = getModelDisplayLabel(modelId);
  // Close dropdown
  _closePickerDropdown();
  // Re-render to update selection highlight
  _renderPickerList();
  // Show/hide field schema section for models that require it
  _updateFieldSchemaVisibility();
}

function _updateFieldSchemaVisibility() {
  const section = document.getElementById('cuFieldSchemaSection');
  if (!section) return;
  const model = _pickerModels.find(m => m.id === _pickerSelected);
  const show = model && model.needsSchema && currentService === 'cu';
  section.style.display = show ? '' : 'none';
  if (show) _initSchemaEditor();
}

/* ── Schema dual-mode editor ── */
const _SCHEMA_FIELD_TYPES = ['string','number','integer','boolean','date','time','array','object'];
let _schemaEditorMode = 'table'; // 'table' | 'json'
let _schemaEditorInited = false;

function _initSchemaEditor() {
  if (_schemaEditorInited) return;
  _schemaEditorInited = true;

  const tblBtn = document.getElementById('schemaModeTblBtn');
  const jsonBtn = document.getElementById('schemaModeJsonBtn');
  const addBtn = document.getElementById('schemaAddRowBtn');

  tblBtn?.addEventListener('click', () => _switchSchemaMode('table'));
  jsonBtn?.addEventListener('click', () => _switchSchemaMode('json'));
  addBtn?.addEventListener('click', () => {
    _addSchemaRow('', 'string', '');
    _syncTableToJson();
  });

  // If textarea already has content (restored from cache), parse into table
  const raw = document.getElementById('optCuFieldSchema')?.value.trim() || '';
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        _populateTableFromObj(obj);
      }
    } catch { /* ignore invalid */ }
  }
  // If table is empty, add one empty row
  if (!document.getElementById('schemaTableBody')?.children.length) {
    _addSchemaRow('', 'string', '');
  }
}

function _switchSchemaMode(mode) {
  _schemaEditorMode = mode;
  const tblMode = document.getElementById('schemaTableMode');
  const jsonMode = document.getElementById('schemaJsonMode');
  const tblBtn = document.getElementById('schemaModeTblBtn');
  const jsonBtn = document.getElementById('schemaModeJsonBtn');

  if (mode === 'table') {
    // Sync JSON → table
    _syncJsonToTable();
    tblMode.style.display = '';
    jsonMode.style.display = 'none';
    tblBtn.classList.add('schema-mode-btn--active');
    jsonBtn.classList.remove('schema-mode-btn--active');
  } else {
    // Sync table → JSON
    _syncTableToJson();
    tblMode.style.display = 'none';
    jsonMode.style.display = '';
    jsonBtn.classList.add('schema-mode-btn--active');
    tblBtn.classList.remove('schema-mode-btn--active');
  }
}

function _addSchemaRow(name, type, desc) {
  const tbody = document.getElementById('schemaTableBody');
  if (!tbody) return;
  const namePh = tr('schema.fieldNamePlaceholder');
  const descPh = tr('schema.fieldDescPlaceholder');
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input class="input schema-field-name" type="text" value="${_escAttr(name)}" placeholder="${_escAttr(namePh)}"></td>
    <td><select class="input schema-field-type">${_SCHEMA_FIELD_TYPES.map(t => `<option value="${t}"${t === type ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
    <td><input class="input schema-field-desc" type="text" value="${_escAttr(desc)}" placeholder="${_escAttr(descPh)}"></td>
    <td><button type="button" class="schema-row-del" title="Delete">\u00d7</button></td>`;
  tbody.appendChild(row);

  // Attach events
  row.querySelector('.schema-row-del').addEventListener('click', () => {
    row.remove();
    _syncTableToJson();
  });
  row.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => _syncTableToJson());
    el.addEventListener('change', () => _syncTableToJson());
  });
}

function _escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _readTableRows() {
  const tbody = document.getElementById('schemaTableBody');
  if (!tbody) return {};
  const obj = {};
  for (const row of tbody.children) {
    const name = row.querySelector('.schema-field-name')?.value.trim();
    const type = row.querySelector('.schema-field-type')?.value || 'string';
    const desc = row.querySelector('.schema-field-desc')?.value.trim();
    if (!name) continue;
    const field = { type };
    if (desc) field.description = desc;
    obj[name] = field;
  }
  return obj;
}

function _syncTableToJson() {
  const textarea = document.getElementById('optCuFieldSchema');
  if (!textarea) return;
  const obj = _readTableRows();
  textarea.value = Object.keys(obj).length ? JSON.stringify(obj, null, 2) : '';
  textarea.dispatchEvent(new Event('input'));
}

function _syncJsonToTable() {
  const textarea = document.getElementById('optCuFieldSchema');
  if (!textarea) return;
  const raw = textarea.value.trim();
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      _populateTableFromObj(obj);
    }
  } catch { /* keep table as is */ }
}

function _populateTableFromObj(obj) {
  const tbody = document.getElementById('schemaTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const [name, def] of Object.entries(obj)) {
    const type = (def && def.type) || 'string';
    const desc = (def && def.description) || '';
    _addSchemaRow(name, type, desc);
  }
  if (!tbody.children.length) _addSchemaRow('', 'string', '');
}

function _getFieldSchemaJson() {
  if (_schemaEditorMode === 'table') {
    _syncTableToJson();
  }
  return document.getElementById('optCuFieldSchema')?.value.trim() || '';
}

function _openPickerDropdown() {
  const picker = document.getElementById('modelPicker');
  if (!picker) return;
  picker.classList.add('model-picker--open');
  const input = document.getElementById('modelFilterInput');
  if (input) { input.value = ''; input.focus(); }
  _renderPickerList();
}

function _closePickerDropdown() {
  const picker = document.getElementById('modelPicker');
  if (picker) picker.classList.remove('model-picker--open');
}

function _initPickerEvents() {
  const btn = document.getElementById('modelPickerBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const picker = document.getElementById('modelPicker');
      if (picker?.classList.contains('model-picker--open')) {
        _closePickerDropdown();
      } else {
        _openPickerDropdown();
      }
    });
  }
  const filterInput = document.getElementById('modelFilterInput');
  if (filterInput) {
    filterInput.addEventListener('input', () => _renderPickerList());
    filterInput.addEventListener('click', (e) => e.stopPropagation());
    filterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') _closePickerDropdown();
    });
  }
  const usCheckbox = document.getElementById('modelUsCheckbox');
  if (usCheckbox) {
    usCheckbox.addEventListener('change', () => _renderPickerList());
    usCheckbox.addEventListener('click', (e) => e.stopPropagation());
  }
  const dropdown = document.getElementById('modelPickerDropdown');
  if (dropdown) dropdown.addEventListener('click', (e) => e.stopPropagation());
  // Close on outside click
  document.addEventListener('click', () => _closePickerDropdown());
}

async function loadModels() {
  const endpoint = currentService === 'cu' ? '/api/cu/models' : '/api/models';
  const res = await fetch(endpoint);
  const data = await res.json();

  _pickerModels = data.models || [];

  // Populate hidden backing select
  const select = document.getElementById('modelSelect');
  select.innerHTML = '';
  for (const m of _pickerModels) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = getModelDisplayLabel(m.id);
    select.appendChild(opt);
  }

  // Auto-select first non-US model (or first model)
  const first = _pickerModels.find((m) => !m.us) || _pickerModels[0];
  if (first) {
    _pickerSelected = first.id;
    select.value = first.id;
  }

  // Update picker button label
  const btn = document.getElementById('modelPickerLabel');
  if (btn) btn.textContent = first ? getModelDisplayLabel(first.id) : '…';

  _renderPickerList();
}

async function upload() {
  clearUiForNewUpload();
  const input = document.getElementById('fileInput');
  if (!input.files || input.files.length === 0) {
    alert(tr('alert.selectFile'));
    return;
  }

  const form = new FormData();
  form.append('file', input.files[0]);

  setStatus(tr('status.uploading'));
  setBusy(true, tr('status.uploading'));
  try {
    const res = await fetch('/api/documents', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      setStatus(tr('status.uploadFailed'));
      setBusy(false);
      alert(data.error || tr('error.uploadFailedGeneric'));
      return;
    }

    currentDocument = data.document;
    hasPendingLocalFile = false;
    document.getElementById('fileInfo').textContent = formatDocumentInfo(currentDocument);
    const pv = await renderPreview(currentDocument);

    await checkCacheExists();

    // After upload, refresh the library (cache grows after Analyze, but refresh the listing now)
    await loadLibrary();

    document.getElementById('analyzeBtn').disabled = false;
    syncUploadButtonMode();
    setBusy(false);
    setStatus(tr(pv && pv.ok ? 'status.readyPreviewOk' : 'status.readyPreviewFailed'));
  } catch (err) {
    console.error('Upload failed:', err);
    setBusy(false);
    setStatus(tr('status.uploadFailed'));
    alert(tr('error.uploadFailedGeneric'));
  }
}

async function loadLibrary() {
  const root = document.getElementById('libraryList');
  if (!root) return;
  root.innerHTML = `<div class="hint">${tr('library.loading')}</div>`;
  try {
    const res = await fetch('/api/library');
    const data = await res.json();
    if (!res.ok) {
      root.innerHTML = `<div class="hint">${(data && data.error) ? data.error : tr('library.failedToLoad')}</div>`;
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      root.innerHTML = `<div class="hint">${tr('library.none')}</div>`;
      return;
    }
    root.innerHTML = '';
    for (const it of items) {
      const doc = it.document;
      if (!doc) continue;

      // ── File row (header) ──
      const row = document.createElement('div');
      row.className = 'library__row';

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'library__info';
      info.addEventListener('click', async () => {
        await loadDocumentFromLibrary(doc);
      });

      const title = document.createElement('div');
      title.className = 'library__title';
      title.textContent = doc.filename || doc.id;

      const variants = Array.isArray(it.cachedVariants) ? it.cachedVariants : [];

      info.appendChild(title);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'library__deleteBtn';
      delBtn.title = tr('library.delete');
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = doc.filename || doc.id;
        if (!confirm(tr('library.deleteConfirm', { name }))) return;
        try {
          const res = await fetch(`/api/library/${encodeURIComponent(doc.fileHash)}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
          const data = await res.json();
          setStatus(tr('library.deleted', { caches: data.deletedCaches, docs: data.deletedDocuments }));
          await loadLibrary();
        } catch {
          setStatus(tr('library.deleteFailed'));
        }
      });

      row.appendChild(info);
      row.appendChild(delBtn);
      root.appendChild(row);

      // ── Variant rows (immediately load cached result) ──
      if (variants.length > 0) {
        const variantList = document.createElement('div');
        variantList.className = 'library__variants';
        for (const v of variants) {
          const vRow = document.createElement('div');
          vRow.className = 'library__variantRow';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'library__variantCb';
          cb.dataset.fileHash = doc.fileHash;
          cb.dataset.key = v.key;
          cb.dataset.label = `${doc.filename || doc.id} / ${v.label}`;
          cb.addEventListener('change', () => updateCompareSelection());

          const vBtn = document.createElement('button');
          vBtn.type = 'button';
          vBtn.className = 'library__variantBtn';
          // Parse service badge from label like "[CU] prebuilt-layout (+options)"
          const svcMatch = v.label.match(/^\[(DI|CU)\]\s*(.*)$/);
          if (svcMatch) {
            const badge = document.createElement('span');
            badge.className = `library__svcBadge library__svcBadge--${svcMatch[1].toLowerCase()}`;
            badge.textContent = svcMatch[1];
            vBtn.appendChild(badge);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'library__variantName';
            nameSpan.textContent = svcMatch[2];
            vBtn.appendChild(nameSpan);
          } else {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'library__variantName';
            nameSpan.textContent = v.label;
            vBtn.appendChild(nameSpan);
          }
          // Option keys summary (e.g. "enable_ocr, table_format")
          if (Array.isArray(v.optionKeys) && v.optionKeys.length > 0) {
            const optSpan = document.createElement('span');
            optSpan.className = 'library__variantOpts';
            optSpan.textContent = v.optionKeys.join(', ');
            vBtn.appendChild(optSpan);
          }
          // Saved date
          if (v.savedAt) {
            const dateSpan = document.createElement('span');
            dateSpan.className = 'library__variantDate';
            try {
              const d = new Date(v.savedAt);
              dateSpan.textContent = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch {
              dateSpan.textContent = v.savedAt.slice(0, 16);
            }
            vBtn.appendChild(dateSpan);
          }
          vBtn.title = tr('library.loadVariant');
          vBtn.addEventListener('click', async () => {
            await loadCachedVariant(doc, v.key);
          });

          vRow.appendChild(cb);
          vRow.appendChild(vBtn);
          variantList.appendChild(vRow);
        }
        root.appendChild(variantList);
      }
    }
    updateCompareSelection();
  } catch {
    root.innerHTML = `<div class="hint">${tr('library.failedToLoad')}</div>`;
  }
}

async function refreshLibrary() {
  const btn = document.getElementById('refreshLibraryBtn');
  if (btn) btn.disabled = true;
  setStatus(tr('status.cacheReloadInProgress'));
  try {
    const res = await fetch('/api/library/refresh', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.error) ? data.error : tr('error.cacheReloadFailedGeneric'));
    }
    const added = Number.isFinite(data?.added) ? data.added : null;
    const suffix = added !== null ? ` (+${added})` : '';
    setStatus(tr('status.cacheReloaded', { suffix }));
  } catch (err) {
    console.error(err);
    setStatus(tr('status.cacheReloadFailed'));
    alert(err?.message || tr('error.cacheReloadFailedGeneric'));
  } finally {
    await loadLibrary();
    if (btn) btn.disabled = false;
  }
}

async function loadDocumentFromLibrary(doc) {
  // Auto-load on click (replace currentDocument without uploading)
  clearUiForNewUpload();
  currentDocument = doc;
  hasPendingLocalFile = false;
  document.getElementById('fileInfo').textContent = formatDocumentInfo(doc);
  const pv = await renderPreview(currentDocument);
  await checkCacheExists();
  document.getElementById('analyzeBtn').disabled = false;
  syncUploadButtonMode();
  setStatus(tr(pv && pv.ok ? 'status.readyPreviewOk' : 'status.readyPreviewFailed'));

  // In responsive (3-pane = main tab) mode only, auto-navigate to preview after cache selection if preview is ready
  if (pv && pv.ok) {
    try {
      window.__diMainTabSetActive?.('preview');
    } catch {
      // ignore
    }
  }
}

async function loadCachedVariant(doc, encodedKey) {
  clearUiForNewUpload();
  currentDocument = doc;
  hasPendingLocalFile = false;
  document.getElementById('fileInfo').textContent = formatDocumentInfo(doc);
  syncUploadButtonMode();

  setBusy(true, tr('library.loadingVariant'));
  try {
    // Execute preview rendering and cache result fetching in parallel
    const [pv, cacheRes] = await Promise.all([
      renderPreview(currentDocument),
      fetch(`/api/library/${encodeURIComponent(doc.fileHash)}/cache/${encodeURIComponent(encodedKey)}`),
    ]);

    const cacheData = await cacheRes.json();
    if (!cacheRes.ok || !cacheData.result) {
      setBusy(false);
      document.getElementById('analyzeBtn').disabled = false;
      setStatus(tr('library.variantLoadFailed'));
      alert(cacheData.error || tr('library.variantLoadFailed'));
      return;
    }

    currentOutputContentFormat = cacheData.result.contentFormat || '';

    // Restore service mode and model selection from cached result
    const isCuResult = !!cacheData.result.analyzerId;
    const targetService = isCuResult ? 'cu' : 'di';
    if (targetService !== currentService) {
      await switchService(targetService);
    }
    const cachedModelId = isCuResult
      ? cacheData.result.analyzerId
      : cacheData.result.modelId;
    if (cachedModelId) {
      // Strip derived analyzer prefix (e.g. "studio.prebuilt_image.abc123" → "prebuilt-image")
      let modelToSelect = cachedModelId;
      if (modelToSelect.startsWith('studio.')) {
        // Derived analyzer: extract original model name from second segment
        const parts = modelToSelect.split('.');
        if (parts.length >= 2) {
          modelToSelect = parts[1].replace(/_/g, '-');
        }
      }
      // Select the model if it exists in the picker
      const found = _pickerModels.find(m => m.id === modelToSelect);
      if (found) {
        _selectPickerModel(found.id);
      }
    }

    await displayResult(cacheData.result);

    // Restore options from _meta if available
    const meta = cacheData.result._meta;
    if (meta && meta.options && typeof meta.options === 'object') {
      _restoreOptionsFromMeta(meta.options);
    }

    setBusy(false);

    // Navigate to results in responsive mode
    if (pv && pv.ok) {
      try { window.__diMainTabSetActive?.('results'); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('loadCachedVariant failed:', err);
    setBusy(false);
    setStatus(tr('library.variantLoadFailed'));
  }
}

/**
 * Restore UI option controls from _meta.options saved in cache.
 */
function _restoreOptionsFromMeta(opts) {
  if (!opts || typeof opts !== 'object') return;

  // Map: option key → { id, type }
  // type: 'check' (checkbox), 'text' (input/textarea), 'select', 'tri' (tri-state select)
  const mapping = {
    // DI options
    enable_high_resolution: { id: 'optHighRes',    type: 'check' },
    enable_formulas:        { id: 'optFormulas',    type: 'check' },
    enable_barcodes:        { id: 'optBarcodes',    type: 'check' },
    enable_style_font:      { id: 'optStyleFont',   type: 'check' },
    pages:                  { id: 'optPages',        type: 'text' },
    locale:                 { id: 'optLocale',       type: 'text' },
    output_content_format:  { id: 'optOutputContentFormat', type: 'select' },
    query_fields:           { id: 'optQueryFields',  type: 'text', join: true },
    // CU options
    content_range:          { id: 'optCuContentRange',       type: 'text' },
    processing_location:    { id: 'optCuProcessingLocation', type: 'select' },
    return_details:         { id: 'optCuReturnDetails',      type: 'tri' },
    omit_content:           { id: 'optCuOmitContent',        type: 'tri' },
    estimate_field_source_and_confidence: { id: 'optCuEstimateFieldSource', type: 'tri' },
    enable_ocr:             { id: 'optCuEnableOcr',          type: 'tri' },
    enable_layout:          { id: 'optCuEnableLayout',       type: 'tri' },
    enable_formula:         { id: 'optCuEnableFormula',      type: 'tri' },
    enable_barcode:         { id: 'optCuEnableBarcode',      type: 'tri' },
    enable_figure_description: { id: 'optCuEnableFigureDescription', type: 'tri' },
    enable_figure_analysis: { id: 'optCuEnableFigureAnalysis', type: 'tri' },
    enable_annotations:     { id: 'optCuEnableAnnotations',  type: 'tri' },
    table_format:           { id: 'optCuTableFormat',        type: 'select' },
    chart_format:           { id: 'optCuChartFormat',        type: 'select' },
    annotation_format:      { id: 'optCuAnnotationFormat',   type: 'select' },
    enable_segment:         { id: 'optCuEnableSegment',      type: 'tri' },
    segment_per_page:       { id: 'optCuSegmentPerPage',     type: 'tri' },
    field_schema:           { id: 'optCuFieldSchema',        type: 'json' },
  };

  for (const [key, conf] of Object.entries(mapping)) {
    if (!(key in opts)) continue;
    const el = document.getElementById(conf.id);
    if (!el) continue;
    const val = opts[key];
    if (conf.type === 'check') {
      el.checked = !!val;
    } else if (conf.type === 'text') {
      el.value = conf.join && Array.isArray(val) ? val.join(', ') : (val ?? '');
    } else if (conf.type === 'select' || conf.type === 'tri') {
      el.value = val === true ? 'true' : val === false ? 'false' : (val ?? '');
    } else if (conf.type === 'json') {
      el.value = typeof val === 'object' ? JSON.stringify(val, null, 2) : (val ?? '');
    }
  }
}

async function analyze() {
  if (!currentDocument) {
    alert(tr('alert.uploadFirst'));
    return;
  }

  const modelId = getModelId();
  if (!modelId) {
    alert(tr('alert.selectModel'));
    return;
  }

  currentModelId = modelId;

  // Validate field schema for models that require it
  const selectedModel = _pickerModels.find(m => m.id === modelId);
  if (selectedModel && selectedModel.needsSchema) {
    const schemaRaw = _getFieldSchemaJson();
    if (!schemaRaw) {
      alert(tr('alert.needsSchemaEmpty', { model: modelId }));
      return;
    }
  }

  let options;
  try {
    options = collectAnalyzeOptions();
  } catch (err) {
    alert(err?.message || tr('error.analyzeFailedGeneric'));
    return;
  }

  // Restore previous UI state for the same file/model (page, BBox type)
  const st = loadUiState(currentDocument.fileHash, modelId);
  if (st && typeof st.overlayMode === 'string') {
    overlayMode = st.overlayMode;
    const sel = document.getElementById('overlaySelect');
    sel.value = overlayMode;
  }
  if (st && Number.isFinite(st.pageNumber)) {
    currentPageNumber = Math.max(1, parseInt(st.pageNumber, 10));
  }

  setStatus(tr('status.analyzingQueued'));
  setBusy(true, tr('busy.title'));
  document.getElementById('summaryText').textContent = '-';
  const jsonViewer = document.getElementById('jsonViewer');
  if (jsonViewer) {
    jsonViewer.innerHTML = `<div class="hint">${tr('json.loading')}</div>`;
  }
  document.getElementById('itemsRoot').innerHTML = `<div class="hint">${tr('json.loading')}</div>`;
  document.getElementById('analyzeBtn').disabled = true;

  currentOutputContentFormat = options.output_content_format || '';

  try {
    let res, data;
    let requestPayload;
    if (currentService === 'cu') {
      // Content Understanding: use analyzerId
      requestPayload = { documentId: currentDocument.id, analyzerId: modelId, options };
      res = await fetch('/api/cu/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
    } else {
      // Document Intelligence: use modelId + options
      requestPayload = { documentId: currentDocument.id, modelId, options };
      res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
    }
    data = await res.json();
    // Strip undefined properties via JSON.parse/stringify to match the actually sent JSON
    currentRequestPayload = JSON.parse(JSON.stringify(requestPayload));
    // Render request JSON immediately
    const reqViewer = document.getElementById('requestJsonViewer');
    if (reqViewer) {
      renderInteractiveJson(currentRequestPayload, reqViewer);
      document.getElementById('expandAllRequestJsonBtn').disabled = false;
      document.getElementById('collapseAllRequestJsonBtn').disabled = false;
      document.getElementById('downloadRequestJsonBtn').disabled = false;
    }
    if (!res.ok) {
      setStatus(tr('status.analyzeFailed'));
      setBusy(false);
      document.getElementById('analyzeBtn').disabled = false;
      alert(data.error || tr('error.analyzeFailedGeneric'));
      return;
    }

    currentJobId = data.job.id;
    document.getElementById('jobInfo').textContent = currentJobId;
    await pollJob(currentJobId);
  } catch (err) {
    console.error('Analyze failed:', err);
    setBusy(false);
    document.getElementById('analyzeBtn').disabled = false;
    setStatus(tr('status.analyzeFailed'));
    alert(tr('error.analyzeFailedGeneric'));
  }
}

async function displayResult(result) {
  currentJsonResult = result;
  currentResult = currentService === 'cu' ? normalizeCuResultForUi(result) : result;
  setOverlayControlsEnabled(true);

  overlayMode = 'lines';
  const overlaySel = document.getElementById('overlaySelect');
  if (overlaySel) overlaySel.value = overlayMode;

  const jsonViewer = document.getElementById('jsonViewer');
  if (jsonViewer) {
    renderInteractiveJson(currentJsonResult || currentResult, jsonViewer);
    document.getElementById('expandAllBtn').disabled = false;
    document.getElementById('collapseAllBtn').disabled = false;
  }

  if (currentService === 'cu') {
    // Content Understanding result rendering
    document.getElementById('summaryText').textContent = summarizeCuResult(currentJsonResult, currentResult);
    renderCuItems(currentJsonResult);
    renderStructureViewer(currentResult);
    renderStructure3D(currentResult);
    renderMarkdownPreview(currentResult);
  } else {
    // Document Intelligence result rendering
    document.getElementById('summaryText').textContent = summarizeResult(currentResult);
    renderItems(currentResult);
    renderStructureViewer(currentResult);
    renderStructure3D(currentResult);
    renderMarkdownPreview(currentResult);
  }

  if (pdfDoc) {
    const sel = document.getElementById('pageSelect');
    if (sel && sel.options.length) {
      const max = sel.options.length;
      if (currentPageNumber > max) currentPageNumber = 1;
      sel.value = String(currentPageNumber);
      await renderPdfPage(currentPageNumber);
    } else {
      drawOverlayForPage(currentPageNumber);
    }
  } else {
    drawOverlayForPage(1);
  }

  saveUiState();
  drawOverlayForPage(currentPageNumber);
  document.getElementById('downloadJsonBtn').disabled = false;
  setStatus(tr('status.succeeded'));
  document.getElementById('analyzeBtn').disabled = false;
}

async function pollJob(jobId) {
  const start = Date.now();
  while (true) {
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json();
    if (!res.ok) {
      setStatus(tr('status.jobLookupFailed'));
      alert(data.error || tr('error.jobLookupFailedGeneric'));
      return;
    }

    const status = data.job.status;
    setStatus(tr('status.analyzingWithStatus', { status }));

    if (status === 'failed') {
      setStatus(tr('status.failed'));
      setBusy(false);
      document.getElementById('analyzeBtn').disabled = false;
      alert(data.job.error || tr('error.jobFailedGeneric'));
      return;
    }

    if (status === 'succeeded') {
      try {
        const r = await fetch(`/api/jobs/${jobId}/result`);
        const rd = await r.json();
        if (!r.ok) {
          setStatus(tr('status.resultFetchFailed'));
          setBusy(false);
          document.getElementById('analyzeBtn').disabled = false;
          alert(rd.error || tr('error.resultFetchFailedGeneric'));
          return;
        }

        await displayResult(rd.result);

        // Refresh library since cache has grown
        await loadLibrary();
      } catch (error) {
        console.error('Error processing result:', error);
        setStatus(tr('status.errorProcessingResult'));
        alert(tr('alert.errorProcessingResult'));
      } finally {
        // Always hide the busy overlay
        setBusy(false);
        document.getElementById('analyzeBtn').disabled = false;
      }
      return;
    }

    if (Date.now() - start > 1000 * 180) {
      setStatus(tr('status.timeout'));
      setBusy(false);
      document.getElementById('analyzeBtn').disabled = false;
      alert(tr('alert.timeout'));
      return;
    }

    await new Promise(r => setTimeout(r, 1500));
  }
}

async function loadUserTabs() {
  try {
    const lang = currentLang || 'en';
    const res = await fetch(`/api/usertabs?lang=${encodeURIComponent(lang)}`);
    if (!res.ok) return;
    const data = await res.json();
    const tabsContainer = document.getElementById('resultTabs');
    const panesContainer = document.getElementById('userTabPanes');
    if (!tabsContainer || !panesContainer || !data.tabs) return;

    // Remove previously loaded usertab buttons and panes
    tabsContainer.querySelectorAll('.tab[data-tab^="usertab-"]').forEach(el => el.remove());
    panesContainer.querySelectorAll('.usertab-pane').forEach(el => el.remove());

    for (const tab of data.tabs) {
      // Tab button
      const tabBtn = document.createElement('button');
      tabBtn.className = 'tab';
      tabBtn.type = 'button';
      tabBtn.dataset.tab = `usertab-${tab.name}`;
      tabBtn.textContent = tab.title || tab.name;
      tabBtn.addEventListener('click', () => activateTab(`usertab-${tab.name}`));
      tabsContainer.appendChild(tabBtn);

      // Tab pane (apply common CSS via ut-content class)
      const pane = document.createElement('div');
      pane.className = 'tabpane usertab-pane ut-content';
      pane.id = `tab-usertab-${tab.name}`;
      panesContainer.appendChild(pane);

      // Load HTML content (sanitized with DOMPurify)
      try {
        const htmlRes = await fetch(`/api/usertabs/${encodeURIComponent(tab.name)}?lang=${encodeURIComponent(lang)}`);
        if (htmlRes.ok) {
          const rawHtml = await htmlRes.text();
          if (typeof DOMPurify !== 'undefined') {
            pane.innerHTML = DOMPurify.sanitize(rawHtml, {
              ALLOW_UNKNOWN_PROTOCOLS: false,
              ALLOWED_TAGS: [
                'div','span','p','h1','h2','h3','h4','h5','h6','ul','ol','li',
                'table','thead','tbody','tr','th','td','caption',
                'strong','em','b','i','u','s','br','hr','pre','code',
                'a','img','section','article','header','footer',
                'details','summary','dl','dt','dd','figure','figcaption',
                'blockquote','abbr','sup','sub','mark','small','label'
              ],
              ALLOWED_ATTR: [
                'class','id','style','href','src','alt','title','width','height',
                'colspan','rowspan','target','rel','aria-label','role','data-*'
              ],
              FORBID_TAGS: ['script','iframe','object','embed','form','input','textarea','select','button','meta','link','base'],
              FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur','onsubmit','onchange','onkeydown','onkeyup','onkeypress','onmouseenter','onmouseleave','oncontextmenu','ondblclick','oninput','onscroll','onwheel','onanimationstart','ontransitionend','onpointerdown','onpointerup'],
            });
          } else {
            console.warn('DOMPurify not available – user tab HTML inserted without sanitization');
            pane.innerHTML = rawHtml;
          }
        } else {
          pane.innerHTML = `<div class="hint">${tr('library.tabLoadFailed')}</div>`;
        }
      } catch {
        pane.innerHTML = `<div class="hint">${tr('library.tabLoadFailed')}</div>`;
      }
    }
  } catch (e) {
    console.warn('Failed to load user tabs:', e);
  }
}

function setupTabs() {
  // Right pane tabs
  const tabs = Array.from(document.querySelectorAll('.tab[data-tab]'));
  for (const t of tabs) {
    t.addEventListener('click', () => {
      activateTab(t.dataset.tab);
    });
  }
  
  // Preview pane tabs
  const previewTabs = Array.from(document.querySelectorAll('.tab[data-preview-tab]'));
  for (const t of previewTabs) {
    t.addEventListener('click', () => {
      activatePreviewTab(t.dataset.previewTab);
    });
  }
}

function activatePreviewTab(tabName) {
  const tabs = document.querySelectorAll('.tab[data-preview-tab]');
  tabs.forEach(t => {
    if (t.dataset.previewTab === tabName) {
      t.classList.add('tab--active');
    } else {
      t.classList.remove('tab--active');
    }
  });

  const panes = document.querySelectorAll('.preview-tabpane');
  panes.forEach(p => {
    if (p.id === `preview-tab-${tabName}`) {
      p.classList.add('preview-tabpane--active');
    } else {
      p.classList.remove('preview-tabpane--active');
    }
  });

  if (tabName === 'structure3d') {
    renderStructure3D(currentResult);
  }
}

function renderMarkdownPreview(result) {
  const viewer = document.getElementById('markdownViewer');
  const tab = document.querySelector('.tab[data-preview-tab="markdown"]');
  const rawTab = document.querySelector('.tab[data-preview-tab="raw"]');
  const rawViewer = document.getElementById('rawViewer');

  if (!viewer || !window.marked || !rawViewer) {
    if (viewer) viewer.innerHTML = `<div class="hint">${tr('alert.markedLoadFailed')}</div>`;
    return;
  }

  const format = (currentOutputContentFormat || result?.contentFormat || '').toLowerCase();
  const content = typeof result?.content === 'string' ? result.content : '';

  const hasContent = !!content;
  const shouldShowMd = hasContent && format === 'markdown';
  const shouldShowRaw = hasContent;

  if (tab) {
    tab.disabled = !shouldShowMd;
    tab.classList.toggle('tab--disabled', !shouldShowMd);
  }
  if (rawTab) {
    rawTab.disabled = !shouldShowRaw;
    rawTab.classList.toggle('tab--disabled', !shouldShowRaw);
  }

  if (!shouldShowMd) {
    if (tab && tab.classList.contains('tab--active')) {
      // Prefer Raw if available, otherwise fallback to Document
      if (shouldShowRaw) activatePreviewTab('raw');
      else activatePreviewTab('document');
    }
    viewer.innerHTML = `<div class="hint">${tr('markdown.hint')}</div>`;
  } else {
    try {
      const html = window.marked.parse(content || '');
      viewer.innerHTML = `<div class="markdown-body">${html}</div>`;
    } catch (err) {
      console.error(err);
      viewer.innerHTML = `<div class="hint">${tr('alert.markdownRenderFailed')}</div>`;
    }
  }

  if (shouldShowRaw) {
    rawViewer.textContent = content;
  } else {
    rawViewer.textContent = tr('raw.hint');
    if (rawTab && rawTab.classList.contains('tab--active')) activatePreviewTab('document');
  }
}

// Interactive JSON Viewer
function renderInteractiveJson(obj, container) {
  container.innerHTML = '';
  if (!obj) {
    container.innerHTML = `<div class="hint">${tr('alert.noData')}</div>`;
    return;
  }
  
  const fragment = document.createDocumentFragment();
  renderJsonNode(obj, fragment, 0, true, null, []);
  container.appendChild(fragment);
}

function renderJsonNode(value, parent, depth, isTopLevel = false, parentToggleId = null, pathPrefix = []) {
  const indent = '  '.repeat(depth);
  
  if (value === null) {
    const line = createJsonLine(indent, null, null, 'null', 'null', depth, parentToggleId, pathPrefix);
    parent.appendChild(line);
  } else if (Array.isArray(value)) {
    renderJsonArray(value, parent, depth, isTopLevel, parentToggleId, pathPrefix);
  } else if (typeof value === 'object') {
    renderJsonObject(value, parent, depth, isTopLevel, parentToggleId, pathPrefix);
  } else if (typeof value === 'string') {
    const full = String(value);
    const isLong = full.length > 100;
    const truncated = isLong ? `${full.substring(0, 100)}...` : full;
    const line = createJsonLine(indent, null, null, `"${escapeHtml(truncated)}"`, 'string', depth, parentToggleId, pathPrefix, full, isLong);
    parent.appendChild(line);
  } else if (typeof value === 'number') {
    const line = createJsonLine(indent, null, null, String(value), 'number', depth, parentToggleId, pathPrefix);
    parent.appendChild(line);
  } else if (typeof value === 'boolean') {
    const line = createJsonLine(indent, null, null, String(value), 'boolean', depth, parentToggleId, pathPrefix);
    parent.appendChild(line);
  }
}

function renderJsonObject(obj, parent, depth, isTopLevel = false, parentToggleId = null, pathPrefix = []) {
  const indent = '  '.repeat(depth);
  const keys = Object.keys(obj);
  
  if (keys.length === 0) {
    return;
  }
  
  const childrenContainer = document.createElement('div');
  childrenContainer.className = isTopLevel ? '' : 'json-line--collapsed';
  if (parentToggleId) {
    childrenContainer.dataset.parent = parentToggleId;
  }
  
  keys.forEach((key, index) => {
    const value = obj[key];
    const keyIndent = '  '.repeat(depth + 1);
    const isLast = index === keys.length - 1;
    
    if (value === null) {
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": null`, 'null', depth + 1, parentToggleId, pathPrefix.concat([key]));
      childrenContainer.appendChild(line);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": []`, null, depth + 1, parentToggleId, pathPrefix.concat([key]));
        childrenContainer.appendChild(line);
      } else {
        const arrayToggleId = `json-toggle-${Math.random().toString(36).substr(2, 9)}`;
        const keyLine = createJsonLine(keyIndent, arrayToggleId, true, `"${escapeHtml(key)}": […] (${value.length} items)`, null, depth + 1, parentToggleId, pathPrefix.concat([key]));
        childrenContainer.appendChild(keyLine);
        
        const arrayContainer = document.createElement('div');
        arrayContainer.className = 'json-line--collapsed';
        arrayContainer.dataset.parent = arrayToggleId;
        renderJsonArrayContent(value, arrayContainer, depth + 2, false, arrayToggleId, pathPrefix.concat([key]));
        childrenContainer.appendChild(arrayContainer);
      }
    } else if (typeof value === 'object') {
      const objToggleId = `json-toggle-${Math.random().toString(36).substr(2, 9)}`;
      const objKeys = Object.keys(value);
      const keyLine = createJsonLine(keyIndent, objToggleId, true, `"${escapeHtml(key)}": {…} (${objKeys.length} props)`, null, depth + 1, parentToggleId, pathPrefix.concat([key]));
      childrenContainer.appendChild(keyLine);
      
      const objContainer = document.createElement('div');
      objContainer.className = 'json-line--collapsed';
      objContainer.dataset.parent = objToggleId;
      renderJsonObjectContent(value, objContainer, depth + 2, false, objToggleId, pathPrefix.concat([key]));
      childrenContainer.appendChild(objContainer);
    } else if (typeof value === 'string') {
      const full = String(value);
      const isLong = full.length > 100;
      const truncated = isLong ? full.substring(0, 100) + '...' : full;
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": "${escapeHtml(truncated)}"`, 'string', depth + 1, parentToggleId, pathPrefix.concat([key]), full, isLong);
      childrenContainer.appendChild(line);
    } else if (typeof value === 'number') {
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": ${value}`, 'number', depth + 1, parentToggleId, pathPrefix.concat([key]));
      childrenContainer.appendChild(line);
    } else if (typeof value === 'boolean') {
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": ${value}`, 'boolean', depth + 1, parentToggleId, pathPrefix.concat([key]));
      childrenContainer.appendChild(line);
    }
  });
  
  parent.appendChild(childrenContainer);
}

function renderJsonObjectContent(obj, parent, depth, isTopLevel = false, parentToggleId = null, pathPrefix = []) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return;
  
  keys.forEach((key, index) => {
    const value = obj[key];
    const keyIndent = '  '.repeat(depth);
    const isLast = index === keys.length - 1;
    
    if (value === null) {
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": null`, 'null', depth, parentToggleId, pathPrefix.concat([key]));
      parent.appendChild(line);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": []`, null, depth, parentToggleId, pathPrefix.concat([key]));
        parent.appendChild(line);
      } else {
        const arrayToggleId = `json-toggle-${Math.random().toString(36).substr(2, 9)}`;
        const keyLine = createJsonLine(keyIndent, arrayToggleId, true, `"${escapeHtml(key)}": […] (${value.length} items)`, null, depth, parentToggleId, pathPrefix.concat([key]));
        parent.appendChild(keyLine);
        
        const arrayContainer = document.createElement('div');
        arrayContainer.className = 'json-line--collapsed';
        arrayContainer.dataset.parent = arrayToggleId;
        renderJsonArrayContent(value, arrayContainer, depth + 1, false, arrayToggleId, pathPrefix.concat([key]));
        parent.appendChild(arrayContainer);
      }
    } else if (typeof value === 'object') {
      const objToggleId = `json-toggle-${Math.random().toString(36).substr(2, 9)}`;
      const objKeys = Object.keys(value);
      const keyLine = createJsonLine(keyIndent, objToggleId, true, `"${escapeHtml(key)}": {…} (${objKeys.length} props)`, null, depth, parentToggleId, pathPrefix.concat([key]));
      parent.appendChild(keyLine);
      
      const objContainer = document.createElement('div');
      objContainer.className = 'json-line--collapsed';
      objContainer.dataset.parent = objToggleId;
      renderJsonObjectContent(value, objContainer, depth + 1, false, objToggleId, pathPrefix.concat([key]));
      parent.appendChild(objContainer);
    } else if (typeof value === 'string') {
      const full = String(value);
      const isLong = full.length > 100;
      const truncated = isLong ? full.substring(0, 100) + '...' : full;
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": "${escapeHtml(truncated)}"`, 'string', depth, parentToggleId, pathPrefix.concat([key]), full, isLong);
      parent.appendChild(line);
    } else if (typeof value === 'number') {
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": ${value}`, 'number', depth, parentToggleId, pathPrefix.concat([key]));
      parent.appendChild(line);
    } else if (typeof value === 'boolean') {
      const line = createJsonLine(keyIndent, null, null, `"${escapeHtml(key)}": ${value}`, 'boolean', depth, parentToggleId, pathPrefix.concat([key]));
      parent.appendChild(line);
    }
  });
}

function renderJsonArray(arr, parent, depth, isTopLevel = false, parentToggleId = null, pathPrefix = []) {
  const indent = '  '.repeat(depth);
  
  if (arr.length === 0) {
    return;
  }
  
  const childrenContainer = document.createElement('div');
  childrenContainer.className = isTopLevel ? '' : 'json-line--collapsed';
  if (parentToggleId) {
    childrenContainer.dataset.parent = parentToggleId;
  }
  
  renderJsonArrayContent(arr, childrenContainer, depth + 1, false, parentToggleId, pathPrefix);
  
  parent.appendChild(childrenContainer);
}

function renderJsonArrayContent(arr, parent, depth, isTopLevel = false, parentToggleId = null, pathPrefix = []) {
  arr.forEach((item, index) => {
    const itemIndent = '  '.repeat(depth);
    const isLast = index === arr.length - 1;
    
    if (item === null) {
      const line = createJsonLine(itemIndent, null, null, `[${index}]: null`, 'null', depth, parentToggleId, pathPrefix.concat([index]));
      parent.appendChild(line);
    } else if (Array.isArray(item)) {
      if (item.length === 0) {
        const line = createJsonLine(itemIndent, null, null, `[${index}]: []`, null, depth, parentToggleId, pathPrefix.concat([index]));
        parent.appendChild(line);
      } else {
        const arrayToggleId = `json-toggle-${Math.random().toString(36).substr(2, 9)}`;
        const openLine = createJsonLine(itemIndent, arrayToggleId, true, `[${index}]: […] (${item.length} items)`, null, depth, parentToggleId, pathPrefix.concat([index]));
        parent.appendChild(openLine);
        
        const arrayContainer = document.createElement('div');
        arrayContainer.className = 'json-line--collapsed';
        arrayContainer.dataset.parent = arrayToggleId;
        renderJsonArrayContent(item, arrayContainer, depth + 1, false, arrayToggleId, pathPrefix.concat([index]));
        parent.appendChild(arrayContainer);
      }
    } else if (typeof item === 'object') {
      const objToggleId = `json-toggle-${Math.random().toString(36).substr(2, 9)}`;
      const objKeys = Object.keys(item);
      const openLine = createJsonLine(itemIndent, objToggleId, true, `[${index}]: {…} (${objKeys.length} props)`, null, depth, parentToggleId, pathPrefix.concat([index]));
      parent.appendChild(openLine);
      
      const objContainer = document.createElement('div');
      objContainer.className = 'json-line--collapsed';
      objContainer.dataset.parent = objToggleId;
      renderJsonObjectContent(item, objContainer, depth + 1, false, objToggleId, pathPrefix.concat([index]));
      parent.appendChild(objContainer);
    } else if (typeof item === 'string') {
      const full = String(item);
      const isLong = full.length > 100;
      const truncated = isLong ? full.substring(0, 100) + '...' : full;
      const line = createJsonLine(itemIndent, null, null, `[${index}]: "${escapeHtml(truncated)}"`, 'string', depth, parentToggleId, pathPrefix.concat([index]), full, isLong);
      parent.appendChild(line);
    } else if (typeof item === 'number') {
      const line = createJsonLine(itemIndent, null, null, `[${index}]: ${item}`, 'number', depth, parentToggleId, pathPrefix.concat([index]));
      parent.appendChild(line);
    } else if (typeof item === 'boolean') {
      const line = createJsonLine(itemIndent, null, null, `[${index}]: ${item}`, 'boolean', depth, parentToggleId, pathPrefix.concat([index]));
      parent.appendChild(line);
    }
  });
}

function createJsonLine(indent, toggleId, collapsed, content, valueType, depth = 0, parentToggleId = null, pathArray = [], fullText = null, showFullButton = false) {
  const line = document.createElement('div');
  line.className = 'json-line';
  line.style.paddingLeft = `${depth * 20}px`;
  line.dataset.depth = String(depth);
  if (Array.isArray(pathArray)) {
    line.dataset.jsonPath = pathArray.join('/');
  }
  if (parentToggleId) {
    line.dataset.parentToggleId = parentToggleId;
  }
  
  if (toggleId) {
    const toggle = document.createElement('span');
    toggle.className = collapsed ? 'json-toggle json-toggle--collapsed' : 'json-toggle';
    toggle.textContent = '▼';
    toggle.dataset.toggleId = toggleId;
    if (parentToggleId) {
      toggle.dataset.parentId = parentToggleId;
    }
    toggle.addEventListener('click', () => toggleJsonNode(toggleId));
    line.appendChild(toggle);
  }
  
  const contentSpan = document.createElement('span');
  
  // Check if content is just a bracket
  const isBracket = ['{', '}', '[', ']'].includes(content.trim()) || 
                    content.trim().match(/^[\{\}\[\]],?$/);
  
  if (isBracket) {
    contentSpan.className = 'json-value json-bracket';
  } else if (valueType) {
    contentSpan.className = `json-value json-value--${valueType}`;
  } else {
    contentSpan.className = 'json-value';
  }
  
  contentSpan.textContent = content;
  line.appendChild(contentSpan);

  // If full text is provided (truncated display), add a small button to view/copy
  if (showFullButton && fullText) {
    const btn = document.createElement('button');
    btn.className = 'json-full-btn';
    btn.type = 'button';
    btn.textContent = tr('modal.full');
    btn.title = tr('modal.fullTitle');
    btn.style.marginLeft = '8px';
    btn.style.padding = '2px 6px';
    btn.style.fontSize = '11px';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showJsonFullText(fullText);
    });
    line.appendChild(btn);
  }
  
  return line;
}

function toggleJsonNode(toggleId) {
  const toggle = document.querySelector(`[data-toggle-id="${toggleId}"]`);
  if (!toggle) return;
  
  const children = document.querySelectorAll(`[data-parent="${toggleId}"]`);
  const isCollapsed = toggle.classList.contains('json-toggle--collapsed');
  
  toggle.classList.toggle('json-toggle--collapsed');
  children.forEach(child => {
    child.classList.toggle('json-line--collapsed');
  });
}

function expandAllJsonNodes(container) {
  const root = container || document;
  const toggles = root.querySelectorAll('.json-toggle--collapsed');
  toggles.forEach(toggle => {
    const toggleId = toggle.dataset.toggleId;
    if (toggleId) {
      toggle.classList.remove('json-toggle--collapsed');
      const children = root.querySelectorAll(`[data-parent="${toggleId}"]`);
      children.forEach(child => child.classList.remove('json-line--collapsed'));
    }
  });
}

function collapseAllJsonNodes(container) {
  const root = container || document;
  const toggles = root.querySelectorAll('.json-toggle:not(.json-toggle--collapsed)');
  toggles.forEach(toggle => {
    const toggleId = toggle.dataset.toggleId;
    if (toggleId) {
      toggle.classList.add('json-toggle--collapsed');
      const children = root.querySelectorAll(`[data-parent="${toggleId}"]`);
      children.forEach(child => child.classList.add('json-line--collapsed'));
    }
  });
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function mapUiJsonPathToViewerPath(pathArray) {
  if (!Array.isArray(pathArray) || pathArray.length === 0) return pathArray;
  if (currentService !== 'cu') return pathArray;

  const jsonRoot = currentJsonResult || currentResult;
  const prefix = jsonRoot && jsonRoot.result && !jsonRoot.contents ? ['result'] : [];

  if (pathArray[0] === 'result') return pathArray;
  if (pathArray[0] === 'contents') return prefix.concat(pathArray);

  const contentPrefix = prefix.concat(['contents', 0]);
  switch (pathArray[0]) {
    case 'pages':
    case 'paragraphs':
    case 'sections':
    case 'tables':
    case 'figures':
    case 'hyperlinks':
    case 'annotations':
    case 'segments':
      return contentPrefix.concat(pathArray);
    default:
      return prefix.concat(pathArray);
  }
}

// Open JSON Viewer to specific path (array of keys / indexes)
function openJsonViewerPath(pathArray) {
  if (!Array.isArray(pathArray) || pathArray.length === 0) return;
  const resolvedPath = mapUiJsonPathToViewerPath(pathArray);
  const targetPath = resolvedPath.join('/');

  activateTab('json');

  // Reset state then focus the target
  setTimeout(() => {
    collapseAllJsonNodes(document.getElementById('jsonViewer'));
    setTimeout(() => {
      const selector = `[data-json-path="${escapeForSelector(targetPath)}"]`;
      const line = document.querySelector(selector);
      if (!line) {
        console.warn('Could not find JSON path', { requested: pathArray, resolved: resolvedPath, targetPath });
        return;
      }

      expandJsonAncestors(line);

      // If the target line itself is collapsible, open it too
      const selfToggle = line.querySelector('.json-toggle');
      if (selfToggle && selfToggle.classList.contains('json-toggle--collapsed')) {
        const selfId = selfToggle.dataset.toggleId;
        if (selfId) toggleJsonNode(selfId);
      }

      line.style.backgroundColor = 'rgba(100, 180, 255, 0.4)';
      line.style.transition = 'background-color 0.3s ease';
      line.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        line.style.backgroundColor = '';
      }, 2800);
    }, 80);
  }, 40);
}

function expandJsonAncestors(line) {
  let toggleId = line.dataset.parentToggleId || null;
  const visited = new Set();
  while (toggleId && !visited.has(toggleId)) {
    visited.add(toggleId);
    const toggle = document.querySelector(`[data-toggle-id="${toggleId}"]`);
    if (!toggle) break;
    if (toggle.classList.contains('json-toggle--collapsed')) {
      toggleJsonNode(toggleId);
    }
    toggleId = toggle.dataset.parentId || null;
  }
}

function escapeForSelector(str) {
  if (window.CSS && CSS.escape) {
    return CSS.escape(str);
  }
  return String(str).replace(/["\\]/g, '\\$&');
}

// Show full JSON string value in a lightweight overlay with copy support
function showJsonFullText(text) {
  const existing = document.getElementById('jsonFullOverlay');
  const overlay = existing || document.createElement('div');
  if (!existing) {
    overlay.id = 'jsonFullOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';

    const panel = document.createElement('div');
    panel.id = 'jsonFullPanel';
    panel.style.maxWidth = '80vw';
    panel.style.maxHeight = '70vh';
    panel.style.background = 'var(--panel, #1e1e1e)';
    panel.style.color = 'var(--text, #f5f5f5)';
    panel.style.padding = '16px';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.35)';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '12px';
    panel.style.width = 'min(900px, 90vw)';

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.gap = '8px';

    const title = document.createElement('div');
    title.textContent = tr('modal.fullText');
    title.style.fontWeight = 'bold';
    toolbar.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '8px';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = tr('modal.copy');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn--small';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).catch(() => {});
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = tr('modal.close');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn--small';
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    btnGroup.appendChild(copyBtn);
    btnGroup.appendChild(closeBtn);
    toolbar.appendChild(btnGroup);

    const pre = document.createElement('pre');
    pre.id = 'jsonFullText';
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.style.fontFamily = 'monospace';
    pre.style.fontSize = '12px';
    pre.style.background = 'var(--surface, rgba(255,255,255,0.04))';
    pre.style.padding = '12px';
    pre.style.borderRadius = '6px';
    pre.style.maxHeight = '55vh';
    pre.style.overflow = 'auto';

    panel.appendChild(toolbar);
    panel.appendChild(pre);
    overlay.appendChild(panel);
  }

  const pre = overlay.querySelector('#jsonFullText');
  if (pre) pre.textContent = text;

  document.body.appendChild(overlay);
}

// 3D Structure Viewer (CSS 3D)
const STRUCTURE3D_STORAGE_KEY = 'diStructure3d';
const STRUCTURE3D_MAX_ITEMS_PER_TYPE = {
  words: 900,
  lines: 700,
  paragraphs: 900,
  tables: 300,
  tableCells: 800,
  keyValuePairs: 400,
  selectionMarks: 600,
  figures: 200,
  formulas: 200,
  barcodes: 200,
};

const STRUCTURE3D_TYPE_ORDER = [
  'tables',
  'tableCells',
  'keyValuePairs',
  'selectionMarks',
  'figures',
  'formulas',
  'barcodes',
  'paragraphs',
  'lines',
  'words',
];

const STRUCTURE3D_TYPE_LABEL = {
  words: 'Words',
  lines: 'Lines',
  paragraphs: 'Paragraphs',
  tables: 'Tables',
  tableCells: 'Cells',
  keyValuePairs: 'KVP',
  selectionMarks: 'Marks',
  figures: 'Figures',
  formulas: 'Formulas',
  barcodes: 'Barcodes',
};

function _structure3dDefaults() {
  return {
    mode: 'page', // 'page' | 'all'
    explode: 28,
    zoom: 100,
    rotX: 58,
    rotY: -18,
    showText: false,
    enabled: {
      tables: true,
      tableCells: false,
      keyValuePairs: true,
      selectionMarks: true,
      figures: true,
      formulas: true,
      barcodes: true,
      paragraphs: true,
      lines: false,
      words: false,
    },
  };
}

let structure3dState = _structure3dDefaults();

function loadStructure3DState() {
  try {
    const raw = localStorage.getItem(STRUCTURE3D_STORAGE_KEY);
    if (!raw) return _structure3dDefaults();
    const obj = JSON.parse(raw);
    const d = _structure3dDefaults();
    return {
      mode: (obj?.mode === 'all') ? 'all' : d.mode,
      explode: Number.isFinite(Number(obj?.explode)) ? Number(obj.explode) : d.explode,
      zoom: Number.isFinite(Number(obj?.zoom)) ? Number(obj.zoom) : d.zoom,
      rotX: Number.isFinite(Number(obj?.rotX)) ? Number(obj.rotX) : d.rotX,
      rotY: Number.isFinite(Number(obj?.rotY)) ? Number(obj.rotY) : d.rotY,
      showText: typeof obj?.showText === 'boolean' ? obj.showText : d.showText,
      enabled: { ...d.enabled, ...(obj?.enabled || {}) },
    };
  } catch {
    return _structure3dDefaults();
  }
}

function saveStructure3DState() {
  try {
    localStorage.setItem(STRUCTURE3D_STORAGE_KEY, JSON.stringify(structure3dState));
  } catch {
    // ignore
  }
}

function getStructure3DEls() {
  return {
    root: document.getElementById('structure3dRoot'),
    stage: document.getElementById('structure3dStage'),
    scene: document.getElementById('structure3dScene'),
    doc: document.getElementById('structure3dDoc'),
    filters: document.getElementById('structure3dFilters'),
    modePageBtn: document.getElementById('structure3dModePage'),
    modeAllBtn: document.getElementById('structure3dModeAll'),
    showText: document.getElementById('structure3dShowText'),
    explode: document.getElementById('structure3dExplode'),
    zoom: document.getElementById('structure3dZoom'),
    inspect: document.getElementById('structure3dInspect'),
    inspectTitle: document.getElementById('structure3dInspectTitle'),
    inspectBody: document.getElementById('structure3dInspectBody'),
  };
}

function isStructure3DTabActive() {
  const pane = document.getElementById('preview-tab-structure3d');
  return !!pane && pane.classList.contains('preview-tabpane--active');
}

function applyStructure3DTransform() {
  const { scene } = getStructure3DEls();
  if (!scene) return;
  const z = clamp(Number(structure3dState.zoom) || 100, 60, 160) / 100;
  const rx = Number(structure3dState.rotX) || 0;
  const ry = Number(structure3dState.rotY) || 0;
  scene.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
  scene.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  scene.style.setProperty('--scale', `${z.toFixed(4)}`);
}

function bboxFromPolygon(polygon) {
  const pts = Array.isArray(polygon) ? polygon : null;
  if (!pts || pts.length < 8) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = Number(pts[i]);
    const y = Number(pts[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return { minX, minY, maxX, maxY };
}

function getPageMeta(result, pageNumber) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const p = pages.find(x => x && x.pageNumber === pageNumber) || null;
  if (!p || !p.width || !p.height) return null;
  return { pageNumber, width: Number(p.width), height: Number(p.height), unit: p.unit || '' };
}

function collect3DItemsForPages(result, pageNumbers) {
  const out = [];
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const want = new Set(pageNumbers);

  // per-page collections
  for (const p of pages) {
    if (!p || !want.has(p.pageNumber)) continue;

    const pageNumber = p.pageNumber;
    const pageIdx = pageNumber - 1;

    // words
    if (Array.isArray(p.words)) {
      const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.words;
      for (let i = 0; i < Math.min(p.words.length, maxN); i++) {
        const w = p.words[i];
        const bbox = bboxFromPolygon(w?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'words',
          pageNumber,
          bbox,
          text: w?.content || '',
          jsonPath: ['pages', pageIdx, 'words', i],
        });
      }
    }

    // lines
    if (Array.isArray(p.lines)) {
      const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.lines;
      for (let i = 0; i < Math.min(p.lines.length, maxN); i++) {
        const ln = p.lines[i];
        const bbox = bboxFromPolygon(ln?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'lines',
          pageNumber,
          bbox,
          text: ln?.content || '',
          jsonPath: ['pages', pageIdx, 'lines', i],
        });
      }
    }

    // selection marks
    if (Array.isArray(p.selectionMarks)) {
      const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.selectionMarks;
      for (let i = 0; i < Math.min(p.selectionMarks.length, maxN); i++) {
        const sm = p.selectionMarks[i];
        const bbox = bboxFromPolygon(sm?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'selectionMarks',
          pageNumber,
          bbox,
          text: `state=${sm?.state ?? '-'} conf=${sm?.confidence ?? '-'}`,
          jsonPath: ['pages', pageIdx, 'selectionMarks', i],
        });
      }
    }

    // formulas
    if (Array.isArray(p.formulas)) {
      const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.formulas;
      for (let i = 0; i < Math.min(p.formulas.length, maxN); i++) {
        const f = p.formulas[i];
        const bbox = bboxFromPolygon(f?.polygon);
        if (!bbox) continue;
        const kind = f?.kind || '-';
        const value = f?.value ? String(f.value) : '';
        const text = value ? `Formula (${kind}) ${value}` : `Formula (${kind})`;
        out.push({
          type: 'formulas',
          pageNumber,
          bbox,
          text,
          jsonPath: ['pages', pageIdx, 'formulas', i],
        });
      }
    }

    // barcodes
    if (Array.isArray(p.barcodes)) {
      const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.barcodes;
      for (let i = 0; i < Math.min(p.barcodes.length, maxN); i++) {
        const b = p.barcodes[i];
        const bbox = bboxFromPolygon(b?.polygon);
        if (!bbox) continue;
        const kind = b?.kind || '-';
        const value = b?.value ? String(b.value) : '';
        const text = value ? `Barcode (${kind}) ${value}` : `Barcode (${kind})`;
        out.push({
          type: 'barcodes',
          pageNumber,
          bbox,
          text,
          jsonPath: ['pages', pageIdx, 'barcodes', i],
        });
      }
    }
  }

  // paragraphs (top-level)
  if (Array.isArray(result?.paragraphs)) {
    const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.paragraphs;
    const paras = result.paragraphs;
    for (let i = 0, used = 0; i < paras.length && used < maxN; i++) {
      const para = paras[i];
      const regions = Array.isArray(para?.boundingRegions) ? para.boundingRegions : [];
      for (const r of regions) {
        if (!want.has(r?.pageNumber)) continue;
        const bbox = bboxFromPolygon(r?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'paragraphs',
          pageNumber: r.pageNumber,
          bbox,
          text: (para?.content || '').toString(),
          role: para?.role || 'paragraph',
          jsonPath: ['paragraphs', i],
        });
        used++;
        break;
      }
    }
  }

  // tables
  if (Array.isArray(result?.tables)) {
    const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.tables;
    const maxCells = STRUCTURE3D_MAX_ITEMS_PER_TYPE.tableCells;
    const tables = result.tables;
    let usedCells = 0;
    for (let i = 0, used = 0; i < tables.length && used < maxN; i++) {
      const t = tables[i];
      const regions = Array.isArray(t?.boundingRegions) ? t.boundingRegions : [];
      for (const r of regions) {
        if (!want.has(r?.pageNumber)) continue;
        const bbox = bboxFromPolygon(r?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'tables',
          pageNumber: r.pageNumber,
          bbox,
          text: `rows=${t?.rowCount ?? '-'} cols=${t?.columnCount ?? '-'}`,
          jsonPath: ['tables', i],
        });
        used++;
        break;
      }

      // table cells (child items)
      const cells = Array.isArray(t?.cells) ? t.cells : [];
      for (let ci = 0; ci < cells.length && usedCells < maxCells; ci++) {
        const cell = cells[ci];
        const cRegions = Array.isArray(cell?.boundingRegions) ? cell.boundingRegions : [];
        for (const r of cRegions) {
          if (!want.has(r?.pageNumber)) continue;
          const bbox = bboxFromPolygon(r?.polygon);
          if (!bbox) continue;
          const label = `r${cell?.rowIndex ?? '-'} c${cell?.columnIndex ?? '-'}${cell?.kind ? ` (${cell.kind})` : ''}`;
          const content = cell?.content ? String(cell.content).replace(/\s+/g, ' ').trim() : '';
          out.push({
            type: 'tableCells',
            pageNumber: r.pageNumber,
            bbox,
            text: content ? `${label} ${content}` : label,
            jsonPath: ['tables', i, 'cells', ci],
          });
          usedCells++;
          break;
        }
      }
    }
  }

  // key value pairs
  if (Array.isArray(result?.keyValuePairs)) {
    const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.keyValuePairs;
    const kvps = result.keyValuePairs;
    for (let i = 0, used = 0; i < kvps.length && used < maxN; i++) {
      const kv = kvps[i];
      const kRegions = Array.isArray(kv?.key?.boundingRegions) ? kv.key.boundingRegions : [];
      const vRegions = Array.isArray(kv?.value?.boundingRegions) ? kv.value.boundingRegions : [];
      const keyText = (kv?.key?.content || '').toString();
      const valText = (kv?.value?.content || '').toString();
      const label = keyText ? `${keyText}: ${valText}` : valText;

      const regions = [...kRegions.map(r => ({ ...r, _k: true })), ...vRegions.map(r => ({ ...r, _k: false }))];
      for (const r of regions) {
        if (!want.has(r?.pageNumber)) continue;
        const bbox = bboxFromPolygon(r?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'keyValuePairs',
          pageNumber: r.pageNumber,
          bbox,
          text: label,
          role: r._k ? 'key' : 'value',
          jsonPath: ['keyValuePairs', i],
        });
        used++;
        break;
      }
    }
  }

  // figures (best-effort: boundingRegions)
  if (Array.isArray(result?.figures)) {
    const maxN = STRUCTURE3D_MAX_ITEMS_PER_TYPE.figures;
    const figures = result.figures;
    for (let i = 0, used = 0; i < figures.length && used < maxN; i++) {
      const fig = figures[i];
      const regions = Array.isArray(fig?.boundingRegions) ? fig.boundingRegions : [];
      const captionText = fig?.caption?.content ? String(fig.caption.content) : '';
      const label = `Figure #${i + 1}${fig?.id ? ` (${fig.id})` : ''}`;
      const text = captionText ? `${label} ${captionText}` : label;
      for (const r of regions) {
        if (!want.has(r?.pageNumber)) continue;
        const bbox = bboxFromPolygon(r?.polygon);
        if (!bbox) continue;
        out.push({
          type: 'figures',
          pageNumber: r.pageNumber,
          bbox,
          text,
          jsonPath: ['figures', i],
        });
        used++;
        break;
      }
    }
  }

  return out;
}

function compute3DTypeCounts(items) {
  const counts = {};
  for (const it of items) {
    counts[it.type] = (counts[it.type] || 0) + 1;
  }
  return counts;
}

function computeSectionsElementLevels(result) {
  const sections = Array.isArray(result?.sections) ? result.sections : [];
  if (sections.length === 0) return new Map();

  // Mirrors the Structure Viewer algorithm:
  // - start from each section at level=0
  // - recursively descend into child section refs found in elements
  // - assign element level based on the section depth that contains it
  const elementLevel = new Map();

  function setLevel(path, level) {
    if (!path) return;
    const prev = elementLevel.get(path);
    if (!Number.isFinite(prev) || level > prev) elementLevel.set(path, level);
  }

  function walkSection(sectionIndex, level, stack) {
    if (!Number.isFinite(sectionIndex) || sectionIndex < 0 || sectionIndex >= sections.length) return;
    if (stack.has(sectionIndex)) return; // prevent cycles
    stack.add(sectionIndex);

    const section = sections[sectionIndex];
    const elements = Array.isArray(section?.elements) ? section.elements : [];

    for (const elementPath of elements) {
      if (typeof elementPath !== 'string') continue;
      if (elementPath.startsWith('/sections/')) continue; // handled below
      setLevel(elementPath, level);
    }

    const childSections = elements.filter(e => typeof e === 'string' && e.startsWith('/sections/'));
    for (const childRef of childSections) {
      const childIndex = parseInt(String(childRef).split('/').pop(), 10);
      if (!Number.isFinite(childIndex)) continue;
      walkSection(childIndex, level + 1, stack);
    }

    stack.delete(sectionIndex);
  }

  for (let i = 0; i < sections.length; i++) {
    walkSection(i, 0, new Set());
  }

  return elementLevel;
}

function elementPathFromJsonPath(jsonPath) {
  if (!Array.isArray(jsonPath) || jsonPath.length < 2) return null;
  const [root, index] = jsonPath;
  if (!Number.isFinite(Number(index))) return null;

  if (root === 'paragraphs') return `/paragraphs/${index}`;
  if (root === 'tables') return `/tables/${index}`;
  if (root === 'figures') return `/figures/${index}`;
  if (root === 'keyValuePairs') return `/keyValuePairs/${index}`;
  return null;
}

function bboxCenter(bbox) {
  return {
    x: (Number(bbox.minX) + Number(bbox.maxX)) / 2,
    y: (Number(bbox.minY) + Number(bbox.maxY)) / 2,
  };
}

function bboxContainsPoint(bbox, x, y, pad = 0) {
  const px = Number(x);
  const py = Number(y);
  const p = Number(pad) || 0;
  return (
    px >= (bbox.minX - p)
    && px <= (bbox.maxX + p)
    && py >= (bbox.minY - p)
    && py <= (bbox.maxY + p)
  );
}

function build3DFilters(counts) {
  const { filters } = getStructure3DEls();
  if (!filters) return;

  const types = STRUCTURE3D_TYPE_ORDER.filter(t => (counts[t] || 0) > 0);
  if (types.length === 0) {
    filters.innerHTML = `<div class="hint">${tr('structure3d.empty.noOverlay')}</div>`;
    return;
  }

  const parts = [];
  for (const t of types) {
    const checked = !!structure3dState.enabled[t];
    const label = STRUCTURE3D_TYPE_LABEL[t] || t;
    const n = counts[t] || 0;
    parts.push(
      `<label class="structure3d-filter structure3d-filter--${t}">`
      + `<input type="checkbox" data-structure3d-type="${t}" ${checked ? 'checked' : ''} />`
      + `<span class="structure3d-filter__dot" aria-hidden="true"></span>`
      + `<span class="structure3d-filter__label">${label}</span>`
      + `<span class="structure3d-filter__count">${n}</span>`
      + `</label>`
    );
  }
  filters.innerHTML = parts.join('');

  filters.querySelectorAll('input[type="checkbox"][data-structure3d-type]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const type = e.target?.dataset?.structure3dType;
      if (!type) return;
      structure3dState.enabled[type] = !!e.target.checked;
      saveStructure3DState();
      renderStructure3D(currentResult);
    });
  });
}

function clear3DSelection() {
  const { doc, inspect } = getStructure3DEls();
  if (doc) {
    doc.querySelectorAll('.structure3d__item--selected').forEach((n) => n.classList.remove('structure3d__item--selected'));
  }
  if (inspect) inspect.hidden = true;
}

function select3DItem(el, info) {
  const { inspect, inspectTitle, inspectBody } = getStructure3DEls();
  if (!el) return;
  clear3DSelection();
  el.classList.add('structure3d__item--selected');
  if (!inspect || !inspectTitle || !inspectBody) return;

  const title = `${STRUCTURE3D_TYPE_LABEL[info.type] || info.type} (p.${info.pageNumber})`;
  const details = {
    type: info.type,
    pageNumber: info.pageNumber,
    baseLevel: Number.isFinite(info.baseLevel) ? info.baseLevel : undefined,
    level: Number.isFinite(info.level) ? info.level : undefined,
    role: info.role || undefined,
    text: info.text ? String(info.text).slice(0, 1200) : '',
  };
  inspectTitle.textContent = title;
  inspectBody.textContent = JSON.stringify(details, null, 2);
  inspect.hidden = false;
}

function renderStructure3D(result) {
  const { root, stage, doc, filters } = getStructure3DEls();
  if (!root || !stage || !doc || !filters) return;

  root.classList.toggle('structure3d--showText', !!structure3dState.showText);

  if (!result || !Array.isArray(result.pages) || result.pages.length === 0) {
    doc.innerHTML = `<div class="structure3d__empty">${tr('structure3d.empty.afterAnalyze')}</div>`;
    filters.innerHTML = '';
    clear3DSelection();
    applyStructure3DTransform();
    return;
  }

  const mode = structure3dState.mode === 'all' ? 'all' : 'page';
  const pageNumbers = mode === 'all'
    ? result.pages.map(p => p.pageNumber).filter(Number.isFinite)
    : [currentPageNumber];

  const itemsAll = collect3DItemsForPages(result, pageNumbers);
  const counts = compute3DTypeCounts(itemsAll);
  build3DFilters(counts);

  const elementLevels = computeSectionsElementLevels(result);

  // filter by enabled types
  const enabledSet = new Set(Object.keys(structure3dState.enabled).filter(k => !!structure3dState.enabled[k]));
  const items = itemsAll.filter(it => enabledSet.has(it.type));

  clear3DSelection();

  // scene constants
  const explode = clamp(Number(structure3dState.explode) || 0, 0, 80);
  const layerSpacing = explode; // px
  const pageSpacing = Math.max(18, Math.round(explode * 1.4));

  const frag = document.createDocumentFragment();

  const pageIndexByNumber = new Map();
  pageNumbers.forEach((n, idx) => pageIndexByNumber.set(n, idx));

  for (const pn of pageNumbers) {
    const meta = getPageMeta(result, pn);
    if (!meta) continue;

    const pageEl = document.createElement('div');
    pageEl.className = 'structure3d__page';
    pageEl.dataset.pageNumber = String(pn);
    pageEl.style.aspectRatio = `${meta.width} / ${meta.height}`;
    const pidx = pageIndexByNumber.get(pn) || 0;
    pageEl.style.setProperty('--pz', `${-pidx * pageSpacing}px`);

    const label = document.createElement('div');
    label.className = 'structure3d__pageLabel';
    label.textContent = tr('preview.page', { n: pn });
    pageEl.appendChild(label);

    // Compute levels for all items on the page (even filtered-out ones),
    // then render only enabled types.
    const pageItemsAll = itemsAll.filter(it => it.pageNumber === pn);
    const pageItems = pageItemsAll.filter(it => enabledSet.has(it.type));

    // Hierarchy rules (containers -> content):
    // - tables contain tableCells + words/lines/etc
    // - tableCells contain words/lines/etc
    // - figures contain words/lines/etc (best-effort)
    // - paragraphs contain words/lines/etc (best-effort)
    // - keyValuePairs (virtual container: union of key+value bboxes) contain words/lines/etc
    const containerPad = Math.max(meta.width, meta.height) * 0.003;
    const stage1ContainerTypes = new Set(['tables', 'figures', 'paragraphs']);

    function unionBbox(a, b) {
      if (!a) return b;
      if (!b) return a;
      return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
      };
    }

    // base levels from sections
    for (const it of pageItemsAll) {
      const elementPath = elementPathFromJsonPath(it?.jsonPath);
      const baseLevel = elementPath ? (elementLevels.get(elementPath) ?? 0) : 0;
      it.baseLevel = baseLevel;
    }

    // virtual containers for KVP (union of key/value bboxes per keyValuePairs index)
    const kvpContainers = [];
    {
      const byIdx = new Map();
      for (const it of pageItemsAll) {
        if (it.type !== 'keyValuePairs') continue;
        const idx = Array.isArray(it?.jsonPath) ? it.jsonPath[1] : null;
        if (!Number.isFinite(Number(idx)) || !it.bbox) continue;
        const cur = byIdx.get(idx) || { bbox: null, level: 0 };
        cur.bbox = unionBbox(cur.bbox, it.bbox);
        cur.level = Math.max(cur.level, Number.isFinite(it.baseLevel) ? it.baseLevel : 0);
        byIdx.set(idx, cur);
      }
      for (const v of byIdx.values()) {
        if (v.bbox) kvpContainers.push({ type: 'keyValuePairs', bbox: v.bbox, level: v.level, source: null });
      }
    }

    function buildContainers(typesSet, levelsKey) {
      const containers = [];
      for (const it of pageItemsAll) {
        if (!it.bbox) continue;
        if (!typesSet.has(it.type)) continue;
        const lvl = Number.isFinite(it[levelsKey]) ? it[levelsKey] : 0;
        containers.push({ type: it.type, bbox: it.bbox, level: lvl, source: it });
      }
      // include virtual KVP containers
      containers.push(...kvpContainers.map(c => ({ ...c, level: c.level })));
      return containers;
    }

    function boostLevels(inputKey, outputKey, containers) {
      for (const it of pageItemsAll) {
        const start = Number.isFinite(it[inputKey]) ? it[inputKey] : 0;
        let lvl = start;
        if (it.bbox && containers.length > 0) {
          const c = bboxCenter(it.bbox);
          for (const parent of containers) {
            if (parent.source && parent.source === it) continue;
            if (bboxContainsPoint(parent.bbox, c.x, c.y, containerPad)) {
              lvl = Math.max(lvl, (Number(parent.level) || 0) + 1);
            }
          }
        }
        it[outputKey] = lvl;
      }
    }

    // stage 1: tables/figures/paragraphs + KVP virtual
    boostLevels('baseLevel', '_lvl1', buildContainers(stage1ContainerTypes, 'baseLevel'));

    // stage 2: add tableCells as containers (after they were boosted above tables)
    const stage2ContainerTypes = new Set(['tables', 'figures', 'paragraphs', 'tableCells']);
    boostLevels('_lvl1', '_lvl2', buildContainers(stage2ContainerTypes, '_lvl1'));

    for (const it of pageItemsAll) {
      it.level = Number.isFinite(it._lvl2) ? it._lvl2 : (Number.isFinite(it._lvl1) ? it._lvl1 : (Number.isFinite(it.baseLevel) ? it.baseLevel : 0));
    }

    // Hard rule: tableCells are children of tables by identity, not only geometry.
    // Ensure they are always above their parent table.
    const tableLevelByIndex = new Map();
    for (const it of pageItemsAll) {
      if (it.type !== 'tables') continue;
      const idx = Array.isArray(it?.jsonPath) ? it.jsonPath[1] : null;
      if (!Number.isFinite(Number(idx))) continue;
      if (!Number.isFinite(it.level)) continue;
      const prev = tableLevelByIndex.get(Number(idx));
      tableLevelByIndex.set(Number(idx), Number.isFinite(prev) ? Math.max(prev, it.level) : it.level);
    }
    for (const it of pageItemsAll) {
      if (it.type !== 'tableCells') continue;
      const tIdx = Array.isArray(it?.jsonPath) ? it.jsonPath[1] : null;
      if (!Number.isFinite(Number(tIdx))) continue;
      const parentLevel = tableLevelByIndex.get(Number(tIdx));
      if (!Number.isFinite(parentLevel)) continue;
      it.level = Math.max(Number.isFinite(it.level) ? it.level : 0, parentLevel + 1);
    }

    for (let i = 0; i < pageItems.length; i++) {
      const it = pageItems[i];
      const bbox = it.bbox;
      const leftPct = (bbox.minX / meta.width) * 100;
      const topPct = (bbox.minY / meta.height) * 100;
      const wPct = ((bbox.maxX - bbox.minX) / meta.width) * 100;
      const hPct = ((bbox.maxY - bbox.minY) / meta.height) * 100;
      if (!Number.isFinite(leftPct) || !Number.isFinite(topPct) || !Number.isFinite(wPct) || !Number.isFinite(hPct)) continue;
      if (wPct <= 0 || hPct <= 0) continue;

      const typeIndex = Math.max(0, STRUCTURE3D_TYPE_ORDER.indexOf(it.type));
      const level = Number.isFinite(it.level) ? it.level : 0;

      // Z layering policy:
      // - section depth (level) must dominate ordering
      // - type offset is only a small nudge within the same level
      // - keep a minimum separation so hierarchy remains visible even if explode=0
      const effectiveLevelSpacing = Math.max(10, layerSpacing);
      const typeOffset = Math.min(typeIndex * 1.2, effectiveLevelSpacing * 0.9);
      const z = ((Number(level) + 1) * effectiveLevelSpacing) + typeOffset;

      it.level = level;

      const node = document.createElement('div');
      node.className = `structure3d__item structure3d__item--${it.type}`;
      node.style.left = `${leftPct}%`;
      node.style.top = `${topPct}%`;
      node.style.width = `${wPct}%`;
      node.style.height = `${hPct}%`;
      node.style.setProperty('--z', `${z}px`);
      node.dataset.type = it.type;
      node.dataset.pageNumber = String(it.pageNumber);
      node.dataset.role = it.role ? String(it.role) : '';
      {
        const raw = (it.text || '').toString().replace(/\s+/g, ' ').trim();
        node.dataset.text = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
      }
      node.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        select3DItem(node, it);

        if (Array.isArray(it?.jsonPath) && it.jsonPath.length > 0) {
          if (typeof isResponsiveTabMode === 'function' && isResponsiveTabMode()) {
            window.__diMainTabSetActive?.('results');
          }
          openJsonViewerPath(it.jsonPath);
        }
      });

      pageEl.appendChild(node);
    }

    frag.appendChild(pageEl);
  }

  doc.innerHTML = '';
  doc.appendChild(frag);

  stage.onclick = () => clear3DSelection();
  applyStructure3DTransform();
}

function initStructure3D() {
  const els = getStructure3DEls();
  if (!els.root || !els.stage || !els.scene || !els.doc) return;

  structure3dState = loadStructure3DState();

  if (els.explode) els.explode.value = String(structure3dState.explode);
  if (els.zoom) els.zoom.value = String(structure3dState.zoom);
  if (els.showText) {
    els.showText.checked = !!structure3dState.showText;
    els.root.classList.toggle('structure3d--showText', !!structure3dState.showText);
  }

  function setMode(mode) {
    structure3dState.mode = (mode === 'all') ? 'all' : 'page';
    if (els.modePageBtn) els.modePageBtn.setAttribute('aria-pressed', structure3dState.mode === 'page' ? 'true' : 'false');
    if (els.modeAllBtn) els.modeAllBtn.setAttribute('aria-pressed', structure3dState.mode === 'all' ? 'true' : 'false');
    saveStructure3DState();
    renderStructure3D(currentResult);
  }

  els.modePageBtn?.addEventListener('click', () => setMode('page'));
  els.modeAllBtn?.addEventListener('click', () => setMode('all'));
  setMode(structure3dState.mode);

  els.explode?.addEventListener('input', (e) => {
    structure3dState.explode = Number(e.target.value);
    saveStructure3DState();
    renderStructure3D(currentResult);
  });

  els.showText?.addEventListener('change', (e) => {
    structure3dState.showText = !!e.target.checked;
    els.root?.classList.toggle('structure3d--showText', !!structure3dState.showText);
    saveStructure3DState();
  });

  els.zoom?.addEventListener('input', (e) => {
    structure3dState.zoom = Number(e.target.value);
    saveStructure3DState();
    applyStructure3DTransform();
  });

  // drag rotate + wheel zoom
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  els.stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    els.stage.setPointerCapture?.(e.pointerId);
    els.stage.classList.add('structure3d__stage--dragging');
  });

  els.stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    structure3dState.rotY = (Number(structure3dState.rotY) || 0) + dx * 0.25;
    structure3dState.rotX = clamp((Number(structure3dState.rotX) || 0) - dy * 0.18, 10, 85);
    applyStructure3DTransform();
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    els.stage.classList.remove('structure3d__stage--dragging');
    saveStructure3DState();
  }

  els.stage.addEventListener('pointerup', endDrag);
  els.stage.addEventListener('pointercancel', endDrag);

  els.stage.addEventListener('wheel', (e) => {
    if (!isStructure3DTabActive()) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    structure3dState.zoom = clamp((Number(structure3dState.zoom) || 100) - delta * 6, 60, 160);
    if (els.zoom) els.zoom.value = String(structure3dState.zoom);
    applyStructure3DTransform();
    saveStructure3DState();
  }, { passive: false });

  applyStructure3DTransform();
}

// Structure Viewer
function renderStructureViewer(result) {
  const container = document.getElementById('structureViewer');
  if (!container) return;
  
  if (!result) {
    container.innerHTML = `<div class="hint">${tr('structure.hint')}</div>`;
    return;
  }
  
  const hasParagraphs = Array.isArray(result.paragraphs) && result.paragraphs.length > 0;
  const hasSections = Array.isArray(result.sections) && result.sections.length > 0;
  
  if (!hasParagraphs && !hasSections) {
    container.innerHTML = `<div class="hint">${tr('structure.noData')}</div>`;
    return;
  }
  
  const html = `
    <div class="structure-nav">
      ${hasParagraphs ? `<button class="structure-nav__btn structure-nav__btn--active" data-structure="paragraphs">${tr('structure.paragraphs')}</button>` : ''}
      ${hasSections ? `<button class="structure-nav__btn" data-structure="sections">${tr('structure.sections')}</button>` : ''}
    </div>
    ${hasParagraphs ? renderParagraphsView(result.paragraphs) : ''}
    ${hasSections ? renderSectionsView(result.sections, result) : ''}
  `;
  
  container.innerHTML = html;
  
  // Setup structure navigation
  const navBtns = container.querySelectorAll('.structure-nav__btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('structure-nav__btn--active'));
      btn.classList.add('structure-nav__btn--active');
      
      const target = btn.dataset.structure;
      container.querySelectorAll('.structure-content').forEach(content => {
        content.classList.remove('structure-content--active');
      });
      const targetContent = container.querySelector(`#structure-${target}`);
      if (targetContent) {
        targetContent.classList.add('structure-content--active');
      }
    });
  });
  
  // Setup toggle buttons
  const toggleBtns = container.querySelectorAll('.structure-node__toggle');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const content = e.target.previousElementSibling;
      if (content && content.classList.contains('structure-node__content')) {
        content.classList.toggle('structure-node__content--expanded');
        e.target.textContent = content.classList.contains('structure-node__content--expanded')
          ? tr('structure.showLess')
          : tr('structure.showMore');
      }
    });
  });
}

function renderParagraphsView(paragraphs) {
  const stats = {
    total: paragraphs.length,
    title: paragraphs.filter(p => p.role === 'title').length,
    sectionHeading: paragraphs.filter(p => p.role === 'sectionHeading').length,
    pageHeader: paragraphs.filter(p => p.role === 'pageHeader').length,
    pageFooter: paragraphs.filter(p => p.role === 'pageFooter').length,
    footnote: paragraphs.filter(p => p.role === 'footnote').length,
  };
  
  let html = '<div class="structure-content structure-content--active" id="structure-paragraphs">';
  
  html += '<div class="structure-stats">';
  html += `<div class="structure-stat"><div class="structure-stat__value">${stats.total}</div><div class="structure-stat__label">${tr('structure.stats.totalParagraphs')}</div></div>`;
  if (stats.title > 0) html += `<div class="structure-stat"><div class="structure-stat__value">${stats.title}</div><div class="structure-stat__label">${tr('structure.stats.titles')}</div></div>`;
  if (stats.sectionHeading > 0) html += `<div class="structure-stat"><div class="structure-stat__value">${stats.sectionHeading}</div><div class="structure-stat__label">${tr('structure.stats.sectionHeadings')}</div></div>`;
  if (stats.pageHeader > 0) html += `<div class="structure-stat"><div class="structure-stat__value">${stats.pageHeader}</div><div class="structure-stat__label">${tr('structure.stats.pageHeaders')}</div></div>`;
  if (stats.pageFooter > 0) html += `<div class="structure-stat"><div class="structure-stat__value">${stats.pageFooter}</div><div class="structure-stat__label">${tr('structure.stats.pageFooters')}</div></div>`;
  if (stats.footnote > 0) html += `<div class="structure-stat"><div class="structure-stat__value">${stats.footnote}</div><div class="structure-stat__label">${tr('structure.stats.footnotes')}</div></div>`;
  html += '</div>';
  
  html += '<div class="structure-tree">';
  paragraphs.forEach((para, index) => {
    const role = para.role || 'paragraph';
    const roleLabel = getStructureRoleLabel(role);
    const content = para.content || '';
    const needsToggle = content.length > 200;
    const displayContent = needsToggle ? content.substring(0, 200) + '...' : content;
    
    html += `<div class="structure-node structure-node--paragraph">`;
    html += `<div class="structure-node__header">`;
    html += `<div class="structure-node__title">`;
    if (role !== 'paragraph') {
      html += `<span class="structure-node__badge structure-node__badge--${role}">${escapeHtml(roleLabel)}</span>`;
    }
    html += tr('structure.paragraphTitle', { n: index + 1 });
    html += `</div>`;
    html += `<div class="structure-node__meta">${tr('structure.characters', { n: content.length })}</div>`;
    html += `</div>`;
    html += `<div class="structure-node__content">${escapeHtml(displayContent)}</div>`;
    if (needsToggle) {
      html += `<button class="structure-node__toggle">${tr('structure.showMore')}</button>`;
    }
    html += `</div>`;
  });
  html += '</div>';
  html += '</div>';
  
  return html;
}

function renderSectionsView(sections, result) {
  let html = '<div class="structure-content" id="structure-sections">';
  
  html += '<div class="structure-stats">';
  html += `<div class="structure-stat"><div class="structure-stat__value">${sections.length}</div><div class="structure-stat__label">${tr('structure.stats.totalSections')}</div></div>`;
  html += '</div>';
  
  html += '<div class="structure-tree">';
  sections.forEach((section, index) => {
    html += renderSectionNode(section, index, 0, result);
  });
  html += '</div>';
  html += '</div>';
  
  return html;
}

function renderSectionNode(section, index, level, result) {
  const elements = section.elements || [];
  const elementsCount = {
    paragraphs: elements.filter(e => e.startsWith('/paragraphs/')).length,
    sections: elements.filter(e => e.startsWith('/sections/')).length,
    tables: elements.filter(e => e.startsWith('/tables/')).length,
  };
  
  const nodeClass = level === 0 ? 'structure-node--section' : 'structure-node--subsection';
  const indent = '  '.repeat(level);
  
  let html = `<div class="structure-node ${nodeClass}" style="margin-left: ${level * 20}px;">`;
  html += `<div class="structure-node__header">`;
  html += `<div class="structure-node__title">`;
  html += `<span class="structure-node__badge">${tr('structure.sectionBadge', { n: index })}</span>`;
  html += tr('structure.level', { n: level + 1 });
  html += `</div>`;
  html += `<div class="structure-node__meta">${tr('structure.elements', { n: elements.length })}</div>`;
  html += `</div>`;
  
  // Display element paths with hierarchical structure
  if (elements.length > 0) {
    html += `<div class="structure-node__content">`;
    html += `<div class="structure-elements">`;
    
    elements.forEach((elementPath, idx) => {
      html += `<div class="structure-element" style="margin-left: 10px;">`;
      html += `<span class="structure-element__icon">`;
      
      if (elementPath.startsWith('/paragraphs/')) {
        const paraIndex = parseInt(elementPath.split('/').pop());
        html += `📝`;
        html += `</span>`;
        html += `<span class="structure-element__label">${tr('structure.elementParagraph', { n: paraIndex })}</span>`;
        
        // Show paragraph content preview
        if (result.paragraphs && result.paragraphs[paraIndex]) {
          const para = result.paragraphs[paraIndex];
          const content = para.content || '';
          const preview = content.length > 80 ? content.substring(0, 80) + '...' : content;
          html += `<div class="structure-element__preview">${escapeHtml(preview)}</div>`;
        }
      } else if (elementPath.startsWith('/tables/')) {
        const tableIndex = parseInt(elementPath.split('/').pop());
        html += `📊`;
        html += `</span>`;
        html += `<span class="structure-element__label">${tr('structure.elementTable', { n: tableIndex })}</span>`;
        
        if (result.tables && result.tables[tableIndex]) {
          const table = result.tables[tableIndex];
          html += `<div class="structure-element__preview">${tr('structure.tablePreview', { rows: table.rowCount || '?', cols: table.columnCount || '?' })}</div>`;
        }
      } else if (elementPath.startsWith('/sections/')) {
        html += `📑`;
        html += `</span>`;
        html += `<span class="structure-element__label">${elementPath}</span>`;
      } else {
        html += `📄`;
        html += `</span>`;
        html += `<span class="structure-element__label">${elementPath}</span>`;
      }
      
      html += `</div>`;
    });
    
    html += `</div>`;
    html += `</div>`;
  }
  
  // Recursively render child sections
  const childSections = elements.filter(e => e.startsWith('/sections/'));
  if (childSections.length > 0 && result.sections) {
    childSections.forEach(childRef => {
      const childIndex = parseInt(childRef.split('/').pop());
      if (!isNaN(childIndex) && result.sections[childIndex]) {
        html += renderSectionNode(result.sections[childIndex], childIndex, level + 1, result);
      }
    });
  }
  
  html += `</div>`;
  return html;
}

// ═══════════════════════════════════════════════════════════
// ███  Result Comparison Mode (Semantic Diff)
// ═══════════════════════════════════════════════════════════

/** Selected variant descriptors for comparison: { fileHash, key, label } */
let compareSelections = [];
let compareDiffsOnly = false;

function updateCompareSelection() {
  const cbs = document.querySelectorAll('.library__variantCb:checked');
  compareSelections = Array.from(cbs).map(cb => ({
    fileHash: cb.dataset.fileHash,
    key: cb.dataset.key,
    label: cb.dataset.label,
  }));
  const btn = document.getElementById('compareBtn');
  if (btn) btn.disabled = compareSelections.length < 2;

  // Hide comparison overlay when less than 2 selected
  if (compareSelections.length < 2) {
    const overlay = document.getElementById('compareOverlay');
    if (overlay) overlay.hidden = true;
  }
}

/** Flatten a JSON object into a Map<string, any> using dot-path keys. */
function flattenJson(obj, prefix, out) {
  if (obj === null || obj === undefined) {
    out.set(prefix, obj);
    return;
  }
  if (Array.isArray(obj)) {
    out.set(prefix, `Array(${obj.length})`);
    for (let i = 0; i < obj.length; i++) {
      flattenJson(obj[i], `${prefix}[${i}]`, out);
    }
    return;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    out.set(prefix, `Object{${keys.length}}`);
    for (const k of keys) {
      flattenJson(obj[k], prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  out.set(prefix, obj);
}

/**
 * Semantic diff: compare N parsed JSON results.
 * Returns { allPaths: string[], columns: Map<string, any>[], diffs: Set<string> }
 */
function semanticDiff(results) {
  const columns = results.map(r => {
    const m = new Map();
    flattenJson(r, '', m);
    return m;
  });

  // Collect all unique paths
  const pathSet = new Set();
  for (const col of columns) {
    for (const k of col.keys()) pathSet.add(k);
  }

  // Sort paths naturally
  const allPaths = Array.from(pathSet).sort((a, b) => {
    const partsA = a.split(/[\.\[\]]+/).filter(Boolean);
    const partsB = b.split(/[\.\[\]]+/).filter(Boolean);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const pa = partsA[i] ?? '';
      const pb = partsB[i] ?? '';
      const na = Number(pa);
      const nb = Number(pb);
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        if (na !== nb) return na - nb;
      } else {
        const cmp = pa.localeCompare(pb);
        if (cmp !== 0) return cmp;
      }
    }
    return 0;
  });

  // Identify diffs
  const diffs = new Set();
  for (const path of allPaths) {
    const vals = columns.map(c => c.has(path) ? c.get(path) : undefined);
    const first = vals[0];
    const allSame = vals.every(v => v === first || (v === undefined && first === undefined));
    if (!allSame) diffs.add(path);
  }

  return { allPaths, columns, diffs };
}

/** Determine the diff status of a single cell */
function cellDiffStatus(path, colIdx, columns) {
  const val = columns[colIdx].has(path) ? columns[colIdx].get(path) : undefined;
  const present = columns[colIdx].has(path);

  const othersPresent = columns.some((c, i) => i !== colIdx && c.has(path));
  const othersAbsent = columns.every((c, i) => i === colIdx || !c.has(path));

  if (!present && othersPresent) return 'removed';
  if (present && othersAbsent) return 'added';

  // Check if this value differs from any other column
  for (let i = 0; i < columns.length; i++) {
    if (i === colIdx) continue;
    const other = columns[i].has(path) ? columns[i].get(path) : undefined;
    if (val !== other) return 'changed';
  }
  return 'unchanged';
}

function formatCellValue(val) {
  if (val === undefined) return '—';
  if (val === null) return 'null';
  if (typeof val === 'string' && (val.startsWith('Array(') || val.startsWith('Object{'))) return val;
  if (typeof val === 'string') {
    const display = val.length > 120 ? val.slice(0, 120) + '…' : val;
    return display;
  }
  return String(val);
}

/** Check if a path is a "container" (Array/Object marker) or a leaf value */
function isContainerPath(path, columns) {
  for (const col of columns) {
    const v = col.get(path);
    if (typeof v === 'string' && (v.startsWith('Array(') || v.startsWith('Object{'))) return true;
  }
  return false;
}

/** Get depth of a path for indentation */
function pathDepth(path) {
  let d = 0;
  for (const ch of path) {
    if (ch === '.' || ch === '[') d++;
  }
  return d;
}

/** Render the comparison view */
function renderCompareView(labels, results) {
  const overlay = document.getElementById('compareOverlay');
  const tabsEl = document.getElementById('compareResultTabs');
  const statsEl = document.getElementById('compareStats');
  const bodyEl = document.getElementById('compareBody');
  if (!overlay || !tabsEl || !bodyEl || !statsEl) return;

  // Build tabs
  tabsEl.innerHTML = '';
  labels.forEach((lbl, i) => {
    const tab = document.createElement('div');
    tab.className = 'compare-tab';
    tab.style.setProperty('--col-hue', String((i * 137) % 360));
    tab.textContent = lbl;
    tabsEl.appendChild(tab);
  });

  const { allPaths, columns, diffs } = semanticDiff(results);

  const totalPaths = allPaths.length;
  const diffCount = diffs.size;
  const sameCount = totalPaths - diffCount;
  statsEl.textContent = tr('compare.stats', { total: totalPaths, diffs: diffCount, same: sameCount });

  // Build the comparison table
  const table = document.createElement('div');
  table.className = 'compare-table';

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'compare-row compare-row--header';
  const pathHeader = document.createElement('div');
  pathHeader.className = 'compare-cell compare-cell--path';
  pathHeader.textContent = tr('compare.path');
  headerRow.appendChild(pathHeader);
  for (let i = 0; i < labels.length; i++) {
    const colHeader = document.createElement('div');
    colHeader.className = 'compare-cell compare-cell--header';
    colHeader.style.setProperty('--col-hue', String((i * 137) % 360));
    colHeader.textContent = labels[i];
    headerRow.appendChild(colHeader);
  }
  table.appendChild(headerRow);

  // Collapsible sections: track collapsed parent paths
  const collapsedPaths = new Set();

  // Data rows
  const rowEls = [];
  for (const path of allPaths) {
    const isDiff = diffs.has(path);
    const isContainer = isContainerPath(path, columns);
    const depth = pathDepth(path);

    const row = document.createElement('div');
    row.className = 'compare-row';
    row.dataset.path = path;
    row.dataset.isDiff = isDiff ? '1' : '0';
    row.dataset.isContainer = isContainer ? '1' : '0';
    row.dataset.depth = String(depth);
    if (isDiff) row.classList.add('compare-row--diff');
    if (compareDiffsOnly && !isDiff) row.style.display = 'none';

    // Path cell
    const pathCell = document.createElement('div');
    pathCell.className = 'compare-cell compare-cell--path';
    pathCell.style.paddingLeft = `${8 + depth * 14}px`;

    if (isContainer) {
      const toggle = document.createElement('span');
      toggle.className = 'compare-toggle';
      toggle.textContent = '▾';
      toggle.addEventListener('click', () => {
        const isCollapsed = collapsedPaths.has(path);
        if (isCollapsed) {
          collapsedPaths.delete(path);
          toggle.textContent = '▾';
          toggle.classList.remove('compare-toggle--collapsed');
        } else {
          collapsedPaths.add(path);
          toggle.textContent = '▸';
          toggle.classList.add('compare-toggle--collapsed');
        }
        updateRowVisibility();
      });
      pathCell.appendChild(toggle);
    }

    // Show only the last segment of the path for readability
    const lastSeg = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path;
    const pathLabel = document.createElement('span');
    pathLabel.className = 'compare-path-label';
    pathLabel.textContent = lastSeg || path;
    pathLabel.title = path;
    pathCell.appendChild(pathLabel);
    row.appendChild(pathCell);

    // Value cells
    for (let i = 0; i < columns.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'compare-cell';
      const status = isDiff ? cellDiffStatus(path, i, columns) : 'unchanged';
      cell.classList.add(`compare-cell--${status}`);

      const val = columns[i].has(path) ? columns[i].get(path) : undefined;
      cell.textContent = formatCellValue(val);
      if (typeof val === 'string' && val.length > 120) {
        cell.title = val;
      }
      row.appendChild(cell);
    }

    table.appendChild(row);
    rowEls.push(row);
  }

  function updateRowVisibility() {
    for (const row of rowEls) {
      const p = row.dataset.path;
      const isDiffRow = row.dataset.isDiff === '1';

      // Check if any ancestor is collapsed
      let hidden = false;
      for (const cp of collapsedPaths) {
        if (p !== cp && (p.startsWith(cp + '.') || p.startsWith(cp + '['))) {
          hidden = true;
          break;
        }
      }
      if (hidden) {
        row.style.display = 'none';
        continue;
      }
      if (compareDiffsOnly && !isDiffRow) {
        row.style.display = 'none';
        continue;
      }
      row.style.display = '';
    }
  }

  bodyEl.innerHTML = '';
  bodyEl.appendChild(table);

  // Store references for expand/collapse
  bodyEl._rowEls = rowEls;
  bodyEl._collapsedPaths = collapsedPaths;
  bodyEl._updateVisibility = updateRowVisibility;

  overlay.hidden = false;
}

function initCompareMode() {
  const compareBtn = document.getElementById('compareBtn');
  const closeBtn = document.getElementById('compareCloseBtn');
  const expandBtn = document.getElementById('compareExpandAllBtn');
  const collapseBtn = document.getElementById('compareCollapseAllBtn');
  const diffsBtn = document.getElementById('compareDiffsOnlyBtn');

  if (compareBtn) {
    compareBtn.addEventListener('click', async () => {
      if (compareSelections.length < 2) {
        alert(tr('compare.selectTwo'));
        return;
      }
      await runComparison();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const overlay = document.getElementById('compareOverlay');
      if (overlay) overlay.hidden = true;
    });
  }

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      const bodyEl = document.getElementById('compareBody');
      if (!bodyEl || !bodyEl._collapsedPaths) return;
      bodyEl._collapsedPaths.clear();
      bodyEl.querySelectorAll('.compare-toggle').forEach(t => {
        t.textContent = '▾';
        t.classList.remove('compare-toggle--collapsed');
      });
      bodyEl._updateVisibility?.();
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const bodyEl = document.getElementById('compareBody');
      if (!bodyEl || !bodyEl._rowEls || !bodyEl._collapsedPaths) return;
      for (const row of bodyEl._rowEls) {
        if (row.dataset.isContainer === '1') {
          bodyEl._collapsedPaths.add(row.dataset.path);
        }
      }
      bodyEl.querySelectorAll('.compare-toggle').forEach(t => {
        t.textContent = '▸';
        t.classList.add('compare-toggle--collapsed');
      });
      bodyEl._updateVisibility?.();
    });
  }

  if (diffsBtn) {
    diffsBtn.addEventListener('click', () => {
      compareDiffsOnly = !compareDiffsOnly;
      diffsBtn.textContent = compareDiffsOnly ? tr('compare.showAll') : tr('compare.showOnlyDiffs');
      diffsBtn.classList.toggle('btn--active', compareDiffsOnly);
      const bodyEl = document.getElementById('compareBody');
      bodyEl?._updateVisibility?.();
    });
  }
}

async function runComparison() {
  const overlay = document.getElementById('compareOverlay');
  const bodyEl = document.getElementById('compareBody');
  if (!overlay || !bodyEl) return;

  overlay.hidden = false;
  bodyEl.innerHTML = `<div class="hint">${tr('compare.loading')}</div>`;

  const labels = [];
  const results = [];

  for (const sel of compareSelections) {
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(sel.fileHash)}/cache/${encodeURIComponent(sel.key)}`);
      const data = await res.json();
      if (res.ok && data.result) {
        labels.push(sel.label);
        results.push(data.result);
      }
    } catch (err) {
      console.error('Failed to load variant for comparison:', err);
    }
  }

  if (results.length < 2) {
    bodyEl.innerHTML = `<div class="hint">${tr('compare.noResults')}</div>`;
    return;
  }

  renderCompareView(labels, results);
}

// ═══════════════════════════════════════════════════════════

async function main() {
  initLanguageMenu();
  applyLanguage(getInitialLanguage(), { persist: false });

  initMainTabs();
  initInputPaneTabs();
  initSplitters();
  initThemeMenu();
  initTooltipDismissOnResponsive();
  initStructure3D();
  initUploadsDisabledBanner();
  initUploadDropzone();
  initServiceSelector();
  _initPickerEvents();
  setupTabs();
  await loadModels();
  await loadLibrary();

  const refreshBtn = document.getElementById('refreshLibraryBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshLibrary);
  }

  // Compare mode
  initCompareMode();

  // Wait for pdf.js loader (local-first + unpkg fallback) initialization
  if (window.__pdfjsReady) {
    try {
      const info = await window.__pdfjsReady;
      // PDF functionality is active if no error here
      if (info && info.source) {
        // Don't show status message to avoid clutter
      }
    } catch (e) {
      console.warn(e);
    }
  }

  if (UPLOADS_ENABLED) {
    document.getElementById('uploadBtn').addEventListener('click', handleUploadButtonClick);
  }
  document.getElementById('analyzeBtn').addEventListener('click', analyze);
  syncUploadButtonMode();

  document.getElementById('overlaySelect').addEventListener('change', async (e) => {
    overlayMode = e.target.value;
    drawOverlayForPage(currentPageNumber);
    saveUiState();
    if (isStructure3DTabActive()) renderStructure3D(currentResult);
  });

  document.getElementById('pageSelect').addEventListener('change', async (e) => {
    const n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n)) return;
    currentPageNumber = n;
    await renderPdfPage(currentPageNumber);
    if (isStructure3DTabActive()) renderStructure3D(currentResult);
  });

  document.getElementById('prevPageBtn').addEventListener('click', async () => {
    if (!pdfDoc) return;
    currentPageNumber = Math.max(1, currentPageNumber - 1);
    document.getElementById('pageSelect').value = String(currentPageNumber);
    await renderPdfPage(currentPageNumber);
    if (isStructure3DTabActive()) renderStructure3D(currentResult);
  });

  document.getElementById('nextPageBtn').addEventListener('click', async () => {
    if (!pdfDoc) return;
    currentPageNumber = Math.min(pdfDoc.numPages, currentPageNumber + 1);
    document.getElementById('pageSelect').value = String(currentPageNumber);
    await renderPdfPage(currentPageNumber);
    if (isStructure3DTabActive()) renderStructure3D(currentResult);
  });

  document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    if (!(currentJsonResult || currentResult)) return;
    downloadJson(`analyze-result-${currentJobId || 'job'}.json`, currentJsonResult || currentResult);
  });

  document.getElementById('expandAllBtn').addEventListener('click', () => {
    expandAllJsonNodes(document.getElementById('jsonViewer'));
  });

  document.getElementById('collapseAllBtn').addEventListener('click', () => {
    collapseAllJsonNodes(document.getElementById('jsonViewer'));
  });

  document.getElementById('downloadRequestJsonBtn').addEventListener('click', () => {
    if (!currentRequestPayload) return;
    downloadJson(`analyze-request-${currentJobId || 'job'}.json`, currentRequestPayload);
  });

  document.getElementById('expandAllRequestJsonBtn').addEventListener('click', () => {
    expandAllJsonNodes(document.getElementById('requestJsonViewer'));
  });

  document.getElementById('collapseAllRequestJsonBtn').addEventListener('click', () => {
    collapseAllJsonNodes(document.getElementById('requestJsonViewer'));
  });

  document.getElementById('modelSelect').addEventListener('change', () => {
    checkCacheExists();
  });
  document.getElementById('customModelId').addEventListener('input', () => {
    checkCacheExists();
  });

  const optionInputs = [
    'optHighRes',
    'optFormulas',
    'optBarcodes',
    'optStyleFont',
    'optPages',
    'optLocale',
    'optOutputContentFormat',
    'optQueryFields',
    'optCuContentRange',
    'optCuProcessingLocation',
    'optCuReturnDetails',
    'optCuOmitContent',
    'optCuEstimateFieldSource',
    'optCuEnableOcr',
    'optCuEnableLayout',
    'optCuEnableFormula',
    'optCuEnableBarcode',
    'optCuEnableFigureDescription',
    'optCuEnableFigureAnalysis',
    'optCuEnableAnnotations',
    'optCuTableFormat',
    'optCuChartFormat',
    'optCuAnnotationFormat',
    'optCuEnableSegment',
    'optCuSegmentPerPage',
    'optCuContentCategories',
    'optCuFieldSchema',
  ];
  optionInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      checkCacheExists();
    });
  });

  await renderPreview(null);
}

main().catch(err => {
  console.error(err);
  setStatus(tr('status.initFailed'));
});
