# reservation CHECKPOINT

## フロント実装

複数メニューをタップで追加・再タップで解除し、名称・料金表記・合計所要時間を表示する。週間空き状況はavailabilityWeekを1回呼び、失敗日だけ再取得する。世代管理・AbortControllerで古いレスポンスによるUI上書きを防ぐ。
時間セル選択時には日別APIで再確認する。GASが返したavailableStartTimesだけを選択可能にし、初期状態・取得中・無効な状態は送信不可とする。確認画面と選択内容を照合してPOSTし、送信中の二重送信を防ぐ。POSTは自動再送しない。応答喪失時は登録済みの可能性を案内し、成功時は予約IDを表示する。

## 基準と確認範囲

更新日：2026-09-30（日本時間）。ユーザー承認済みの更新案を反映した。以下の基準コミットは予約実装の版を示し、今回の文書更新コミットはGit履歴で確認する。

- フロント基準コミット：`23facab5c04244acca39e041868685548fc296b7`（Add weekly multi-menu reservation UI）。直前は`4ce94b4`。
- GAS基準コミット：`01ac4d8ac5623608e0da705c23265f77011dfcff`（Save reservation menu snapshots）。
- 店舗サイト基準コミット：`fdf3e966c98a93d5190865d033cfaa6faa1d84a8`。
- 2026-09-30の先行監査でGitHub mainを読み取り照合し、3リポジトリのHEAD・origin/mainと一致。作業ツリーはclean、ahead/behindは0/0。これはその時点の記録であり、次の作業開始時に再確認する。
- GAS本番はVersion 15（ユーザー確認）。APIの公開挙動は確認したが、デプロイ管理画面の版番号・ソースの完全一致は未検証。
- 既存deploymentを更新してURLを維持する。新しいdeployment URLは作成しない。
- 既存本番URL：`https://script.google.com/macros/s/AKfycbyRZPtspRr7fT793KBVko2xt9sNoFalCFOsU0yX_tADdr75NyUDTk4rBqDXlwcLjEFIyQ/exec`
- GASプロジェクトはreservation-gasの`.clasp.json`で識別する。既存deploymentの管理ID・版番号とGitコミットの対応記録は今後確認して追記する。

## APIと予約保護

- 10分刻み。平日10:30、土日10:00開始、19:00までに施術終了。
- `GET action=menus`：Google Sheetsの「メニュー設定」を正として受付ONのメニューを返す。
- `GET action=availability&date=YYYY-MM-DD`：選択メニューに対する`availableStartTimes`を返す。
- `GET action=availabilityWeek&startDate=YYYY-MM-DD`：7日分を1リクエストで返す。`days`は日付をキーとするオブジェクト。任意の`dates`（表示週内の日付をカンマ区切り）で失敗日のみ再取得できる。
- 日別・週間GETは単一`menuId`の後方互換を維持。複数`menuIds`はJSON配列を文字列化・URLエンコードして送る。`menuIds`に1要素だけの指定も可。
- POSTは`sourceType: WEB_PAGE`、`date`、`time`、`name`と、単一`menuId`または配列の`menuIds`を送る。両フィールドの同時指定、重複ID、空選択、不正IDは拒否する。
- 複数メニューの所要時間を合算し、営業時間超過・既存予約との重複を除外する。クライアントからの名称・料金・所要時間を保存値に採用しない。
- ScriptLockを最大10秒待って取得し、ロック内でマスター、営業日、営業時間、過去日時、重複を予約直前に再検証する。appendRow・flush後に解放し、例外時もfinallyで解放する。
- 従来の`GET ?date=...`は維持し、メニュー設定を参照せず占有10分枠を返す。
- メニュー名称だけの旧フォームPOSTは非対応。単一`menuId`の互換とは区別する。

## 予約台帳とスナップショット

台帳は「シート1」。A〜G列の役割を維持する。

| 列 | 保存内容 |
|---|---|
| A | 予約ID |
| B | 氏名 |
| C | WEB予約（LINE未連携）などの経路 |
| D / E | 日付 / 開始時刻 |
| F | 予約時メニュー名（複数は「 ＋ 」で連結） |
| G | 確定（WEB）などの状態 |
| H | 単一ID、複数時はID配列JSON |
| I | 予約時料金表記（複数は連結） |
| J | 合計所要時間（分、数値） |
| K | 予約時メニュー明細JSON。単一も配列。各要素はmenuId/name/price/durationMinutes |

JとKは同じマスター明細から生成する。保存済み予約の占有時間はJを使い、後日のマスター変更で変えない。Kのない旧H:J行も読み取る。旧A/B/Cメニュー名称は専用互換表で読み取り、日時を勝手に変更しない。不正な予約データは空き扱いせずエラーにする。
`menuRevision`は採用していない。料金・所要時間はPOST時点のマスターを採用するため、表示後の変更との差異は別途運用確認が必要。

## 検証結果

2026-09-30の監査でfrontend 31/31、backend 47/47、合計78/78 PASS。Node.js v22.23.1、TZ=Asia/Tokyo。

各リポジトリのルートで、Node.js 18以上を使用する。

```sh
TZ=Asia/Tokyo node --test tests/*.test.cjs
```

今回の環境では上記コマンドがファイル単位の成功表示だったため、各ファイルの直接実行でも31件・47件の内訳と全件成功を確認した。

```sh
# reservation
TZ=Asia/Tokyo node tests/frontend.test.cjs
# reservation-gas
TZ=Asia/Tokyo node tests/backend.test.cjs
```

テストは架空データ・模擬サービスを使用し、本番通信・台帳更新を行わない。実GAS同時実行、実セル型、保存・再読込、ブラウザ通信は別途最終確認する。

既存本番URLへの読み取り専用GET確認済み：

- menus：25メニュー、全件bookable:true。
- startDate=2026-10-03、menuId=PM0001：7日分、10分刻み、平日・土日の開始時間、通常定休日を反映。
- menuIds=[PM0001]：単一配列で成功。
- menuIds=[PM0001,PM0002]：60+90=150分を反映し、営業日の最終開始16:30。
- 本番POST、K列保存、実際の競合拒否はまだ最終確認していない。

## 営業日設定の不一致と必要な確認

ユーザー確定の2026年10月休業日は5・9・11・12・18・19・26日。
通常ルールは毎週月曜と第1・第3日曜（10月は4・5・12・18・19・26日）。
前回本番GETでは10/4は休業、10/9・10/11は営業、3日ともbusinessDayOverride:null。必要な有効上書きがないため通常ルールに戻っている。

必要な「営業日設定」A/B/C列の案：

| A：日付 | B：区分 | C：メモ案 |
|---|---|---|
| 2026-10-04 | 営業 | 2026年10月確定予定：通常定休日を営業に変更 |
| 2026-10-09 | 休業 | 2026年10月確定予定：臨時休業 |
| 2026-10-11 | 休業 | 2026年10月確定予定：臨時休業 |

本番シートの実データ・行・型は未確認。シート欠落、日付形式不一致、不正区分、重複先頭行の問題などの区別はまだできない。既存行を先に確認し、単純追記による重複を避ける。設定変更は未実施。
営業日設定の上書きは営業/休業だけを変更し、開始時刻・終了時刻は変更しない。

## 2台運用と作業手順

店のThinkPadと家のChromebookを交互に使用する。GitHubをソースコード・Git履歴・CHECKPOINTの中央の正本とし、Codexセッションに依存しない。実メニューマスターと営業日設定の正は本番Google Sheets。

- 対象はpepelmocohair/reservation、reservation-gas、pepelmoco-siteの3リポジトリ。フォルダ名・固定パスだけで決めず、Git remoteとGitルートで識別する。
- この端末では3つとも`/home/ysky/dev/`配下。これは発見結果であり、他端末の前提にしない。
- 開始時：syncで全3リポジトリ、ブランチ、dirty、GitHub最新main、ahead/behind/divergedを確認する。
- cleanなmainでorigin/mainよりbehindだけの場合に限りfast-forwardで取得する。dirty/ahead/diverged、detached HEAD、想定外ブランチ、取得失敗は停止して状態と安全な対処案を報告する。自動merge/rebase/reset/force pushや自動修復はしない。
- 終了時：テスト、差分・CHECKPOINT確認、commit、push、GitHubとの一致確認。未pushの変更を片方へ残したままもう片方で開発しない。
- 別端末の未push変更はこの端末から検知できない。端末切り替え前に作業終了確認を行う。
- 各リポジトリは別管理。公式サイトへ予約フォームを誤反映しない。認証情報・端末固有設定は共有しない。
- 現在のpepel-syncは固定候補に依存しThinkPad側GASを取りこぼし得る。この端末ではPATH上のコマンドと`~/.local/bin/pepel-sync`が未設置。改善・設置は未実施。
- 通常SSHは設定読込エラーで照会失敗。監査時は一時的に設定読込を避けて成功したが、通常sync経路の修復・両端末確認は未実施。

## 次の作業と変更制限

1. CHECKPOINT更新案は承認・反映済み。今回の文書更新をcommitし、origin/mainへpushしたうえでHEAD一致・cleanを確認して停止する。完了記録はGit履歴とGitHub mainで確認する。
2. 本番営業日設定の実データを読み取り確認し、10月確定予定へ整える。全31日の日別判定・週間判定を照合する。
3. pepel-syncの3リポジトリ必須検出、異常時停止、SSH/PATHを両端末で確認する。
4. 本番既存deploymentがVersion 15を参照すること、公開フロントとGitコミットの対応を確認する。
5. 実ブラウザで週間表示、複数メニュー追加/解除、時間合算、再取得、時間選択、確認画面を確認する。
6. 本番登録前に台帳H:Kの用途・見出し・テスト日時/氏名・後処理を確認する。テスト予約は人間が承認した内容で実施し、予約ID、F/H/I/J/K保存、再読込、重複拒否を確認する。
7. 営業終了条件と公式サイトの「18:00最終受付」の整合、初回カウンセリングの扱いも確認する。

今回許可されている作業は両CHECKPOINTの反映・commit・origin/mainへのpushと完了確認のみ。予約ロジック/UI、GASコード、同期スクリプト、本番スプレッドシート、GAS deployment、GitHub Pagesは変更しない。clasp push/deploy、本番POSTは実施しない。完了後は本番営業日設定の確認へ進まず停止する。

## 復旧時の注意

過去の記録ではVersion 13が旧30分版として残る。現在の復旧候補として使えるかは再確認が必要。既存deploymentの参照版を変更しURLを維持する方針だが、週間・複数メニュー対応フロントをGASだけ戻して復旧できるとは限らない。対応するフロント版と、新予約データ（H:K）の読取互換を確認する。今回復旧操作は行わない。


## 2026-09-30 ローカル実装：電話番号・予約完了画面（未公開）

- main の作業開始基準: `7badf4f`。以下は実装時の記録。現在のGit確定先・公開状態は末尾の「Git確定地点」を参照すること。
- 新フロントの予約POSTは `requestVersion: 2` + `phone` 必須。国内0始まり10〜11桁、ハイフン・空白・全角数字を正規化し、数字だけを送信・保存。requestVersion省略の旧予約POSTのみphone省略可能（L空欄）。送信されたphoneは旧POSTでも検証。未対応Versionは拒否。単一 `menuId` / 複数 `menuIds` は維持。
- 予約台帳「シート1」のL列を電話番号用とする。先頭0を維持する文字列として保存し、A〜Kの意味は変更しない。旧予約行のL空欄は許容。
- フロントはPOST成功時だけ専用完了画面（予約ID・メニュー・日時・閉じてよい旨）へ切り替え、予約フォームを隠して再操作・再送信を停止。失敗時のエラー処理は維持。
- ScriptLock、予約直前再検証、重複判定、10分刻み、週間API、J合計時間・Kメニュースナップショットを維持。
- ローカル自動テスト: frontend 44/44、backend 62/62、合計106/106 PASS。既存78件を維持し、電話番号・完了表示・失敗時・旧行互換性を追加確認。本リポジトリは44件。
- 本番Sheets・GAS・GitHub Pagesへの反映は未実施。本番はVersion 15、既存deployment URLを維持する。L1見出し「電話番号」・L列文字列保存の確認、新旧フロントとGASの更新順序、別環境でのブラウザ確認が反映前に必要。互換GASを先に既存deploymentへ公開し、確認後に新フロントを公開すること。phone省略の旧フロントは引き続き予約可能。
- 2026年10月の営業日設定問題は解決済み（休業5・9・11・12・18・19・26日）。今回は営業日設定を変更していない。


## 2026-09-30 ローカル実装：顧客キャンセル・requestVersion互換（未公開）

- 本番「シート1」を読み取りのみで再確認：L1:M1000は値・数式・メモ・入力規則・個別書式が空。保存先はL=電話番号、M=キャンセルトークンSHA-256ハッシュ。A〜Kは変更しない。既存のH〜K見出しは空欄だがデータ保存用途は仕様どおり。
- 新規WEB予約は予約ID生成と別にUtilities.getUuid()を2回使用し、ハイフン除去・連結した64桁hexトークン（ランダムUUID由来）を生成。MにはSHA-256だけ保存。平文は予約成功JSONのcancelTokenに返し、canCancelはphone有無で決める。電話なし旧POSTも予約・トークン生成は成功するが顧客キャンセルは不可。平文をログ・台帳に残さない。
- 完了画面は予約ID・メニュー・日時・終了案内を維持し、canCancel=true時に「予約をキャンセルする」リンクを追加。予約フォームと追加予約操作は終了したまま。リンクを保存する案内あり。リンク紛失時やphone/トークンのない旧予約は店舗連絡。
- リンク形式：公開フロントURL + #cancel=<予約ID>&token=<トークン>。電話番号・氏名なし。フラグメントはHTTPのURLへ送信されず、ページ読取後history.replaceStateで#cancelへ置換。資格はメモリのみ保持。Referrer-Policyはno-referrer。リロードする場合は保存した元リンクから開き直す。
- 対象確認API：POST {sourceType:"WEB_PAGE", action:"cancelPreview", reservationId, cancelToken}。読み取り専用。APIのURLへ資格を載せないため、確認にもPOST本文を使う。GETのキャンセル系actionは拒否、リンクを開くGETでは台帳を変更しない。確認応答はstatus/date/time/menu/cancelledのみ。氏名・電話・トークン/ハッシュを返さない。
- 実取消API：POST {sourceType:"WEB_PAGE", action:"cancelReservation", reservationId, cancelToken, phone}。画面に対象日時・メニューを表示し、電話番号全体を入力して明示的に「キャンセルする」を押す。電話単独/予約ID単独の検索・取消は提供しない。
- ScriptLock取得後、IDが一意であること、トークンハッシュ、保存電話番号、G列状態を再読込・照合。確定（WEB）ならGだけ「キャンセル」に変更→flush→release。正しい全資格でキャンセル済みならsuccess/alreadyCancelled:true（再書込なし）。他の状態/存在なし/不正token/電話不一致は同じcancel_unavailable応答。行削除なし。
- キャンセル済み行は既存の占有計算から除外され、同時間帯が再予約可能。予約側と同じScriptLockを使うため双方の書込を直列化。POST自動再試行なし。二重クリック防止・遅い応答による別対象への上書き防止あり。
- 自動テスト：frontend 56/56、backend 90/90、合計146/146 PASS。既存106件を維持し40件追加。UUID/digest/Sheets/Lockはローカルモックで、実ブラウザ・本番API/保存検証は未実施。
- 本番反映時：未使用再確認→L1「電話番号」/L2:L1000プレーンテキスト、M1「キャンセルトークンSHA-256」/M2:M1000プレーンテキスト→互換GASのcommit/push・新Version作成・既存deployment更新→確認→フロントcommit/push・Pages公開。本番反映は未実施。Git確定先と今回の許可範囲は末尾の「Git確定地点」を参照。Version番号/commit対応は本番反映時に記録。
- 公開後は承認済みテスト予約でH〜M保存、リンク確認が非破壊、電話照合取消、G更新、占有解放・再予約競合拒否を確認。旧フロントphone省略互換は時間だけで終了しない。
- 復旧にはキャンセルAPIとL/M読取・保存を維持した正常GAS版を用意する。Version15へ戻すと新キャンセルリンクAPI・電話/ハッシュ保存が失われるので、単純なGASのみ復旧を前提にしない。保存済みL/M・予約行は消さない。
- この節はローカル実装時の記録。GitHub中央正本・2台運用のため未pushの作業を別端末で重ねない。本番Sheets・deployment・本番POST・Pages・SSH設定・営業日設定・pepelmoco-site変更は未実施。


## 2026-09-30 Git確定地点（本番未反映）

- ユーザー承認：reservationは`release/phone-cancel-v2`へcommit/pushし、mainは`7badf4f828dd06d5fbd26e59c92facea4a7519f8`を維持。reservation-gasはmainへcommit/push。本番反映は別途承認後。
- reservationのPages設定は「Deploy from a branch / main / (root)」。準備ブランチをpushしても公開元は変わらない。GAS更新前にreservationをmainへpushしない。
- 確定するソース：frontend 56件・backend 90件、合計146件のローカル自動テスト。commitしたHEADを再テストし、同じ件数の成功、clean、リモート一致を確認する。確定SHAはgit log/git rev-parseで取得でき、作業チャットのrelease-git-checkpoint.jsonにも記録する。
- 現在の本番GAS：Version 15。既存deployment ID=`AKfycbyRZPtspRr7fT793KBVko2xt9sNoFalCFOsU0yX_tADdr75NyUDTk4rBqDXlwcLjEFIyQ`。URL=`https://script.google.com/macros/s/AKfycbyRZPtspRr7fT793KBVko2xt9sNoFalCFOsU0yX_tADdr75NyUDTk4rBqDXlwcLjEFIyQ/exec`。
- 現在公開中フロント：`7badf4f828dd06d5fbd26e59c92facea4a7519f8`。前回監査でPages成功実行36672447165と公開HTML完全一致を確認。Git確定後も公開版が維持されることを読み取り確認する。
- GitHubのGAS mainへのpushはソース保管。自動deployment用.githubワークフローはなく、今回はclasp push/Version作成/deployment更新を行わない。deployment @15の維持をGit確定後に読み取り確認する。
- 次工程：L/M未使用再確認→L1「電話番号」・M1「キャンセルトークンSHA-256」・L2:M1000プレーンテキスト→claspソース反映→新Version作成→既存deployment更新（URL/権限維持）→GET・旧POST互換・キャンセルAPI確認→reservation準備ブランチをmainへ反映→Pages確認→新予約/A〜M保存/Preview/電話照合取消/G更新/枠解放/再予約・競合拒否確認→テスト予約の有効枠を残さず整理→本番Version・SHA・検証結果を両CHECKPOINTへ記録。
- テスト予約の整理は取消ステータスで履歴を残すことを基本とし、物理削除は別途承認なしに行わない。電話番号・平文トークンをGitや検証報告に記録しない。
- 通常SSHはシステム設定の権限エラーがある。今回のGit操作だけ既存WORKFLOWの`GIT_SSH_COMMAND='ssh -F /dev/null -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes'`を使う。SSH設定ファイルは変更しない。

## 2026-10-02 モバイルUX改善（ローカル・作業ブランチ）

- 基準：reservation main `1f3037f`。作業ブランチ `ux/mobile-speed-v1`。本番GASはVersion 17を維持。今回の記録が以前の作業制限に優先する。mainへのcommit/merge/push、clasp push/deploy、本番API通信・予約・Sheets更新は実施していない。
- 参考：実機画像 `references/IMG_9102.PNG`〜`IMG_9107.PNG` を視覚確認。9102〜9104はユーザー確認のLiME、9105〜9107は自作。9106のメニュー取得中の空白、9105の狭い週間表を改善対象とした。外観のコピー・メニュー説明追加は行わない。
- 調査結果：初期取得はmenus 1回。週間取得はavailabilityWeek 1回、既存の重複抑止・失敗日のみ再取得を維持。◎選択はavailability 1回で再検証し、従来は応答後まで選択表示がなかった。通常のステップ移動は通信不要（日時画面で未取得の場合のみ週間GET）。初期通信の実測速度改善は未検証。
- 体感速度：画面上にメニュー読み込み案内とプレースホルダー、取得失敗時の再取得ボタンを表示。menus同時呼び出しを抑止。永続キャッシュは採用しない。◎はタップ直後にハイライト・選択日時と再確認中を表示し、再確認中の全◎と次へを無効化。成功後に次へを有効化、競合・通信失敗時は選択を確定しない。確認済みの同じ◎の再タップは追加GETをしない。世代管理・中断・POSTの再検証と二重送信防止を維持。
- UI：ブランドヘッダー縮小、4段階の現在位置表示、メニューと選択内容の余白圧縮、スマホのパネル枠を除去。週間表を画面幅まで拡張、360px以上は7日分、より狭い幅は案内付き横スクロール。◎は高さ44px、最小列幅約45px。スマホの日時・入力・確認にも下部固定アクション、safe-areaと下部余白を確保。複数選択の下部説明は高さ制限付きスクロール。
- 変更：`index.html`、`tests/frontend.test.cjs`、`CHECKPOINT.md`。GASソース変更なし。電話番号正規化・requestVersion 2・完了・キャンセル・サーバー保護の仕様変更なし。
- テスト：既存frontend 56件を削除・変更せず維持し7件追加（読み込み表示/取得完了、失敗と再取得、即時ハイライトと連打防止、再確認失敗、週移動中の古い応答、4段階と電話番号・確認、同じ枠の重複GET抑止）。frontend 63/63、backend 94/94、合計157/157 PASS。既存の完了画面・キャンセル導線・競合防止テストもPASS。`git diff --check` PASS。
- レイアウト：Chrome headlessで本番fetchを完全に模擬データへ置換した/tmpのHTMLを使用。390×844で読み込み・メニュー・週間表・入力・確認、320×740と768×1024で週間表を画像確認。生成画像・模擬HTMLは/tmpのみ、commit対象外。実iOS/LINE内ブラウザ・ソフトキーボード・VoiceOver・本番通信の待ち時間は未検証。
- 残課題：GAS初回応答時間そのもの、実機の横/縦スクロールと下部固定領域・キーボード、25メニュー/多数複数選択での使用感の最終確認。自動回帰検証済みでコードレビュー・merge候補だが、公開前に実機で上記確認を推奨。mainのmerge/公開は今回実施しない。
- commit SHAはこの節を含む `ux/mobile-speed-v1` のGit履歴で確認する（自己参照SHAは文書に記載しない）。参考画像の未追跡 `references/` はユーザー提供資料として維持し、今回のcommitには含めない。

## 2026-10-02 日時カレンダー中心の追加改善（未公開）

- `ux/mobile-speed-v1`上で追加変更。参考IMG_9103と前回390px画像を実装前に比較。LiMEは週移動直下の7日表と30分行で広い時間帯を提示。自作は重複説明等で表開始が約480px、44pxの10分行で表示範囲が狭かった。
- 日時ステップの4段階表示・メニュー概要・変更リンク・週移動を圧縮。重複する説明を整理、表開始は390×844で約208px。4ステップ、変更リンク、前後週ボタンの44px領域を維持。
- 長い日（表示する10分行が18行超）は30分帯に集約。◎はその帯にAPI許可時刻が1件以上ある意味であり、30分帯全体の予約可能を意味しない。押すと当該帯のAPI許可時刻だけを48px高のダイアログボタンで提示（例10:00/10:10/10:20）。1件の場合も正確な時刻を明示して選択。短い取得範囲は10分行を直接表示。行生成は表示専用、10分予約ロジックと日別再確認・POST仕様は維持。表の◎は36px高、390pxで幅約42px以上。◎タップ時のハイライト、正確な時刻を押した直後の再確認表示・連打防止、同じ確認済み時刻のGET抑止を維持。
- Loadingはカレンダー内の中央表示とspinner。7日ヘッダーを残し、外枠の高さ・位置を取得前後で固定。失敗時はLoadingを終了して再取得を提示。古い応答は新しいLoadingを解除しない。ダイアログはEscape・Tab循環・閉じるボタンを備え、週/メニュー/ステップ変更で閉じ、古い選択肢からの予約を防止。
- 自動テスト：frontend既存63件のassertを維持し6件追加、69/69 PASS。backend変更なし94/94 PASS。既存157件全PASS、合計163/163 PASS。追加は領域内Loadingと完了/失敗/古い応答、30分帯から10:00/10:10/10:20の厳密選択、API許可時刻以外を提示しないこと、週移動後の古い選択拒否。diff --check PASS。
- `python3 tests/layout.check.py`は本番fetchを模擬データで置換しChrome DevToolsで正確なviewportを指定、320×740・390×844・430×932・768×1024それぞれ取得中/取得後を確認（8画面）。7日ヘッダー、390px以上の7日同時表示、表開始230px以内、36px以上の◎高さ、390px以上で16時行が初期表示領域に収まること、Loading前後の外枠寸法一致を検証。スクリーンショットは/tmp/calendar-{幅}-{loaded|loading}.png。生成HTML・画像・プロファイルはcommitしない。
- 全4幅を画像確認。390×844は10:00〜16:30を初期表示、430×932・768×1024は17時台まで。320×740は7日目に横スクロールが必要で初期表示は15時頃まで。約208pxの上部、約86pxの下部操作、37px程度の行により390pxでも実表示高が約730px未満なら16時までは収まらない。ブラウザバー・safe-area・拡大文字・長い複数メニューで可視範囲は減る。実機では◎と隣接日の押し分け、30分帯→10分時刻選択、再確認中/競合、週移動、Loadingと取得後の位置、バー表示時の可視範囲、VoiceOverを確認する。
- 本番GAS Version17・API/台帳の仕様変更なし。mainへのmerge/commit/push、本ブランチのpush、clasp反映・公開、本番予約・Sheets変更なし。ユーザー提供の未追跡references/は維持しcommit対象外。commit SHAは本節を含むブランチのGit履歴で確認する。
