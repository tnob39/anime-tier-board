# PR #137 (Issue #124) — Claude Code レビュー指摘 (2026-06-20)

対象ブランチ: `tnob39/native-p1-codex-review-fixes`
レビュアー: Claude Code
この指摘は Codex の以前の修正(楽観的並行制御・409競合検出)を確認した上で、新たに見つかったバグです。409競合検出の仕組み自体(`lib/boards.ts` / `app/api/boards/route.ts`)は正しく動作しているため変更不要です。

## 修正必須: 自動保存が「信頼できないbaseline」で空ボードをサーバーに上書きしてしまう

対象: `apps/native/src/app/index.tsx`

### 再現条件
1. ユーザーがログイン済み(`isAuthenticated && token`)。
2. `loadAnime()` (79-146行目) 内で `fetchRemoteBoard` がエラーを投げる(ネットワーク不調・サーバーエラーなど)。
3. かつローカルキャッシュ(`readStoredBoard`)も存在しない(新規端末でログイン直後など)。

この場合、119行目で `remoteBaselineRef.current = storedBoard?.updatedAt ?? null` により `null` が入り、121行目の `createDefaultBoard()` で空のボードが作られて `setBoard` される。
同様に、外側の catch (131-140行目、`fetchSeasonalAnime` 自体が失敗した場合)でも 140行目で `remoteBaselineRef.current = null` になる。

### 問題点
`board` の更新は自動保存 effect (152-226行目)を発火させる。発火条件は `isAuthenticated && token` のみ(159行目)であり、直前のロードが正常に完了したかどうかは見ていない。
保存時に `expectedUpdatedAt: remoteBaselineRef.current` (172行目)が `null` のまま渡されると、サーバー側 `saveBoard` の競合チェック(`if (options?.expectedUpdatedAt) {...}`)がまるごとスキップされ、サーバー上の既存ボードが空のデフォルトボードで無条件に上書きされてしまう。

これは本機能(クラウド同期)が想定する典型シナリオ(新しい端末でログイン、かつそのタイミングで通信が一時的に不安定)でまさに発生し得る、サイレントなデータ消失バグである。

### 修正方針
「`remoteBaselineRef` の値がサーバーの実状態を正しく反映していると信頼できるか」を表すフラグ(例: `remoteSyncReliableRef`、初期値 `false`)を追加する。

- `isAuthenticated === false`(未認証) → `true` (ローカル専用モードなので競合リスクなし)
- `fetchRemoteBoard` が例外を投げずに完了した場合(戻り値が board でも null でも) → `true`
- `fetchRemoteBoard` が例外を投げた場合、または外側の catch (`fetchSeasonalAnime` 失敗)に入った場合 → `false`

自動保存 effect 側では、このフラグが `false` の間は `saveRemoteBoard` を呼び出さないようにする。
ローカル保存の `writeStoredBoard` (157行目)は競合リスクが無いため、フラグに関わらず無条件に維持してよい。
`saveState` は既存の `'error'` を使うか、ユーザーに「クラウド同期できていません」と伝わる状態にすること。
次回の `loadAnime()` が成功してフラグが `true` に戻れば、自動保存を再度許可する。

### 触ってはいけない箇所
- `lib/boards.ts` / `app/api/boards/route.ts` の409競合検出ロジック(`expectedUpdatedAt` チェック)は正しく動作している。変更不要。

### 検証手順
修正後、このworktree内で以下を実行して結果を確認すること:
- `npx tsc --noEmit` (リポジトリルート)
- `npx tsc --noEmit` (apps/native ディレクトリ内)
- `npm run build` (リポジトリルート)

すべて成功したら、変更をコミットして既存ブランチに push すること(PR #137 は既にopenなので追加コミットがそのまま反映される)。
**マージは絶対に行わないこと。**
完了したら PR #137 にコメントで修正内容を要約すること。
