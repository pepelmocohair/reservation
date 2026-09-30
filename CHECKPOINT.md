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
