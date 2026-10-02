# 本番Version 17 最終監査結果

監査日：2026-10-02（日本時間）

## 確認結果

- 本番deployment：`AKfycbyRZPtspRr7fT793KBVko2xt9sNoFalCFOsU0yX_tADdr75NyUDTk4rBqDXlwcLjEFIyQ`、Version 17。
- 説明文：「L・M列TEXT書式保持修正 2026-10-02」。監査開始・終了時とも一致。別deploymentは@HEADのまま、Version 15/16も保持。
- GAS main：`50e18f102f12bb1825ebb137425d406114dd79c0`。local HEAD・origin/main・GitHub mainが一致し、working treeはclean。Version 17の実コードもローカルと完全一致。
- clasp認証：`mozuuuu@gmail.com`。
- フロントmain：`7badf4f828dd06d5fbd26e59c92facea4a7519f8`を維持。次期版は`release/phone-cancel-v2`、`3e1ac7cb8ef614b001fc1fb33bb155482c9786bf`。GitHubと一致。
- 本番GET：25メニュー、slotMinutes=10。週間7日が正常応答し、対象日の日別・週間結果が一致。従来GETも成功。

## 本番実測結果

対象枠：2026-11-10 10:30、PM0001「カット」、60分。

| 検証項目 | 結果 |
| --- | --- |
| 1. 新規テスト予約 | 成功。シート1の14行目に追加 |
| 2. L列の先頭0・TEXT形式 | 正規化済み電話番号が文字列として保存され、先頭0を保持。userEnteredFormat・effectiveFormatともTEXT |
| 3. M列のSHA-256・TEXT形式 | 返却tokenのSHA-256と完全一致。userEnteredFormat・effectiveFormatともTEXT |
| 4. cancelPreviewの非破壊性 | 成功。前後で台帳・営業日設定・メニューマスターの取得内容が完全一致 |
| 5. cancelReservationのG列更新 | 正しい電話番号で成功。G14だけが正確に「キャンセル」へ変更。行を保持 |
| 6. キャンセル後の枠解放 | 空き状況が予約前と完全一致 |
| 7. 同じ枠への再予約 | 成功。15行目に追加。L/MのTEXT形式・SHA-256一致も確認 |
| 8. 有効予約存在時の重複拒否 | 同一枠へのPOSTはconflict。台帳・設定は変更されず、追加行なし |
| 9. 旧フロントPOST互換 | requestVersion・電話番号を両方省略して成功。16行目に追加、Lは空欄、L/MはTEXT、MはSHA-256一致、canCancel=false。枠占有も確認 |

## 実施した変更・終了状態

- 監査用予約を3件追加（14～16行目）。14・15行目はcancelReservationで取消し、G列だけの変更を確認。
- 電話番号なしの16行目は仕様上セルフキャンセル対象外のため、予約IDを再照合し、Google Sheets接続からG16だけを「キャンセル」に更新。その他の値・書式は維持。
- 3件すべてのG列が正確に「キャンセル」、行は保持。今回のアクティブな監査予約は0件。
- 最終空き状況は監査前と完全一致。台帳の差分は追加した14～16行目のみ。既存1～13行目、営業日設定、メニューマスターは変更なし。
- GASコード、deployment、フロントmainは変更していない。clasp push・version作成・deployも実施していない。
- 本ファイルだけを今回の監査結果で更新。commit・pushは行っていない。

## 自動テスト

- 次期フロント：56/56 PASS。
- GASバックエンド：94/94 PASS。
- 合計：150/150 PASS（Asia/Tokyoで再実行）。

## 残課題・公開可否

**今回依頼されたVersion 17監査の全9項目はPASS。前回のL/M書式問題は解消を確認。release/phone-cancel-v2をmainへ昇格してよいと判定する。**

フロントmainへの反映は未実施。公開後にGitHub Pagesの配信commitと実ブラウザでの表示・完了画面・キャンセル導線を確認する。今回の本番実測はAPIと台帳の検証であり、実ブラウザ操作と同時並行POSTによる競合試験は含まない。
