# Issue #785 — 今期カードへの再設計

日付: 2026-10-03。基点: `6e0d27d249e5d946b4c30f7b702c70b55ec7176e`。
受け入れ済みIssue本文にあるAstraの `REVISE` を実装へ反映する決定記録。実装者: Codex。独立Astraレビューを実施したという意味ではない。

## 決定

「94作品を処理する」入口から、見た作品への一言と自分の記憶を残す体験へ変更する。文化循環の「記録 → 理由付き評価 → 共有」を担当し、Meaningful Rating Rate / Retention with Valueを対象指標とする。既存5タブとTier内導線は維持する。

入口は最大3候補。取得と所有者の下書き復元を終えてから、書きかけ、有効な過去48時間の放送情報、updatedAt降順の記録、未記録を重複除去する。同順位はID順で固定し、保存・スキップ後に補充しない。検索は全カタログを対象に10件ずつ表示する。再訪時には新しい候補を計算するが、同じ画面で入力中の候補は動かさない。

放送情報は取得済みrecentEpisodesの日時のみ使う。未来、欠落、不正、48時間超は候補優先に使わない。次回放送・曜日から推測しない。JSTの参考表示に限定し、保存用Animeと公開snapshotへ渡さない。

入力は「いまの一言」に初期フォーカス。任意の評価は閉じた開閉部に置く。本文変更はno_spoilerを解除し、評価変更だけなら保持する。140コードポイントを受け付け、141以上でも入力を保持して保存を止める。フォームのEnterは送信せず、保存ボタンだけが書き込む。

保存成功時にのみ件数・カード・成長文言を更新する。編集の件数は不変、削除は1件減る。次作品を自動で開かず、「次の作品に一言」「今日はここまで」を提示する。分母、連続日数、報酬演出を導入しない。

共有は個人カードから開始する。最新6作品を作品情報だけで選択し、本文と評価の公開は作品ごとに明示選択する。preview/publicは同じコンポーネントで描画する。未公開のプレビューは公開日を捏造せず「公開時に記録されます」と表示する。公開後は固定日時をJSTで表示する。確認済みバッジと評価なしは公開しない。

## 状態と安全境界

| 状態 | 動作 |
| --- | --- |
| 初回 / 0件 | 「まず、見た作品から一言。」。個人カードは0作品。空カタログは別クールまたは再読込を案内 |
| 再訪 / 全件記録 | 「今日は、どの作品が心に残りましたか。」。既存の一言を編集できる。視聴済みとは呼ばない |
| 検索0件 | 検索語・絞り込みの変更を案内 |
| 読込中 | 読込状態を表示し、書込を停止 |
| カタログ失敗 | 再読込を案内。取得できた保存済み記録は編集可能 |
| 個人記録失敗 | 未記録と断定せず、保存・共有を停止して再読込を案内 |
| 保存拒否 | 入力を保持。成功表示・件数増加なし |
| 保存結果不明 / 409 | 入力を保持。最新記録のGETと明示的な編集継続を経て、利用者が再保存する。自動PUTなし |
| ゲスト / 認証復帰 / A→B→A | 既存のowner/season/token/TTL拘束を維持。アカウント切替でworkspaceを再作成。復元だけでは保存しない |
| オフライン | 入力可能、保存・公開・停止を無効化。接続復帰だけでは送信しない |
| storage失敗 | 警告してメモリ上の入力を保持。保持できない認証handoffは開始しない |
| 公開結果不明 | POSTを自動再送せず、履歴の確認へ誘導 |
| 停止 / 404 | 所有者の明示操作で停止。既存public/APIのnotFoundとコメント・リアクション拒否を維持 |
| クール変更 / JST境界 / 遅延応答 | 既存season契約・keyed mount・応答versionで分離。公開snapshotの期は固定 |

DB、APIハンドラ、snapshot version、season core、グローバルナビ、Home、Watchlistは変更しない。既存revision/tombstone、ownerヘッダ、固定snapshot、明示publish/revokeを維持する。

analyticsはview/edit/skip/save/shareの型付きイベントのみ追加。runtime allowlistでenumと件数以外を除去する。本文、検索語、作品名、各種ID、URL、token、error文は送らない。productionはno-opのまま。

## アクセシビリティと表示

白背景、細いボーダー、8px角丸、16px余白を今期チェックだけへ適用。Simple/Visualで機能を変えない。共有中は個人カードをアンマウントし、共有画面の背後へ非公開本文を残さない。入力シートは既存focus trap、Escape、起点復帰とvisualViewport対応を維持する。成功で起点が消える場合はカード見出しへフォーカスを移す。

実App Routerの目視で、dark theme由来の補足文字色が白背景で薄くなる点を修正した。今期チェックの `--muted` とnative controlのcolor-schemeも白背景に合わせる。ゲストのログイン・認証復帰案内は候補/選択操作の後に置き、一言の入口を先に見せる。

## 検証

検証はローカルfixtureとファイルDBだけを使用。コマンド実行時は `NEXT_TELEMETRY_DISABLED=1`、`NODE_OPTIONS=--require=./tests/impressions-offline.cjs` を設定し、外部fetch/TCPを遮断した。ブラウザも外部originをabortする。OAuthはローカルJWT、DBはテスト用file URL。依存は同一package-lockのローカル既存インストールからコピーし、インストール通信は行っていない。

| 実行コマンド | 結果 |
| --- | --- |
| `python scripts/validate-orchestration-ack.py --agent codex <TEMP>/atb785-codex-ack.json` | VALID。今回の明示実装指示を適用し、契約のCodex識別・handoffを維持 |
| `node --experimental-loader ./tests/alias-loader.mjs --test tests/season-impressions.test.ts tests/season-impressions-view.test.ts tests/season-contract.test.ts tests/source/season-context-ui.test.ts` | 56/56成功 |
| `node --test tests/season-impressions-browser.test.mjs` | 33/33成功 |
| `node node_modules/@playwright/test/cli.js test --config tests/season-impressions.playwright.config.ts` | desktop/mobile 14/14成功。実App Router・API・JWT・file DBで保存、公開、固定snapshot、停止、404を検証 |
| `node --test tests/season-load-races.test.mjs` | 37/37成功 |
| `node node_modules/@playwright/test/cli.js test --config tests/season-context.playwright.config.ts` | #780 desktop/mobile 36/36成功 |
| `npm.cmd run test:moderation-s3` | 27/27成功 |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `npm.cmd run build` | 通常のNext/Turbopack production build成功。TypeScript成功、静的54ページ生成 |
| `git diff --check` | exit 0 |
| 変更14ファイルのUTF-8 strict decode・mojibake/置換文字検査 | 問題なし |

上記テストは合計203件成功。最後の配置・コントラスト調整後もimpressionsブラウザ33件と実App Router14件を再検証した。375pxの実App Routerで初回見出しがviewport内に入り、補足文字色が `rgb(96, 99, 106)`、横overflowなしであることも確認した。

ブラウザ検証は94作品の全タイトル検索、最大3候補・検索10件・候補非補充、新規/編集/削除の件数、成功前の成長表示禁止、140/141コードポイント・絵文字・改行・IME、no_spoiler解除、初期共有6作品、0件/各取得失敗/保留/拒否/結果不明、offline/storage、A→失効→B→Aを含む。既存TTL、revision/tombstone、immutable snapshot、コメント・リアクション拒否も維持する。

375×812 / 375×380、100/200%文字、長い日本語タイトル、keyboard、reduced motion、44px、横overflowなしを検証。Simpleは入口・editor・個人カード・share preview・publicで画像DOM/リクエスト0。Visualの正対照、画像失敗時の除去も成功した。入口と200%入力シートのスクリーンショットを目視確認した。

検証中に見つかった共有画面背後の個人カードDOM残留をアンマウントへ修正し、401の非公開本文非露出テストを含む全ブラウザテストを通した。旧テストの自動次作品・評価先頭・確認済みバッジの期待値は、受け入れ済み新仕様の反対条件へ更新した。待機sleep、再送retry、timeout増加、assertion削除による回避は行っていない。

初回App Router起動は外部junctionをTurbopackが拒否。ローカル依存の実体コピー後も古い生成キャッシュではauth routeが404となり既存120秒ゲートで失敗した。生成キャッシュを作業ツリー外へ移して通常buildを通した後、同じ未変更のPlaywright設定で14/14成功。APIやNext設定の変更では回避していない。

最終build・型検査後、`git restore --source=HEAD -- AGENTS.md next-env.d.ts` で自動生成差分を復元した。`.next`、`test-results`、`tsconfig.tsbuildinfo` は作業ツリーから除去し、`%TEMP%/atb-785-generated-20261003` に退避した。検証用のローカル依存 `node_modules` は保持。HEADは基点のまま、staged差分なし、変更は下記14ファイルのみ。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `lib/season-impressions-view.ts` | 純粋な候補導出・放送日時検証/JST表示・全件検索/paging・記録順・本文変更/成長文言 |
| `app/tier/impressions/impressions-client.tsx` | 3候補/検索/個人カードの画面、note-first入力、明示保存、成功後のカード表示、offline/結果不明の復帰 |
| `app/tier/impressions/impression-season-card.tsx` | 件数のみの個人カード、本文優先、編集導線 |
| `app/tier/impressions/impression-sharing.tsx` | 個人カード起点、初期6件、作品ごとの本文/評価選択、offline書込停止 |
| `app/tier/impressions/impressions.css` | 今期チェック限定の白背景、入力/検索/カード、44px、reduced motion |
| `components/ImpressionSnapshotView.tsx` | preview/public共通の期・公開日・タイトル・本文・評価順。確認済み/評価なし除去 |
| `app/share/impressions/[shareId]/page.tsx` | 共通rendererへ公開日時を渡す |
| `lib/analytics.ts` | impressionsイベントの型とruntime allowlist、production no-op維持 |
| `tests/season-impressions-view.test.ts` | 導出、境界、全件検索、privacy、analyticsの6テスト |
| `tests/season-impressions-browser.test.mjs` | 既存回帰を新仕様へ更新、94件/文字数/IME/offline/失敗状態等を追加 |
| `tests/season-impressions.spec.ts` | 実App Routerの操作をnote-first/明示次作品/個人カード共有へ更新 |
| `tests/season-impressions.test.ts` | public HTMLで確認済み/評価なしを出さず個人カード見出しを出す検証 |
| `DESIGN.md` | 今期チェックだけの規則を追加 |
| 本文書 | 決定、状態、検証、変更範囲の記録 |

独立レビュー承認、Preview mobile確認、本番確認はオーケストレータへのhandoff対象。今回の明示指示によりコミット・push・PR・デプロイ・外部ネットワークは実施しない。
