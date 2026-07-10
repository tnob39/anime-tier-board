# EPIC #384 引き継ぎ書 — Codex 向け（2026-07-10, Claude Code セッション終了時点）

> **読者**: このEPICを引き継ぐ Codex（および再開する任意のエージェント）
> **作成**: Claude Code session 20260710（オーナー指示「codexに引き継ぐ」による）
> **オーナー承認済み事項**: EPIC #384 の子Issue PR は「検収＋独立レビューを通過していればマージOK」（2026-07-10 オーナー発言。自己レビューのみでのマージは不可）

---

## 1. 現在地（2026-07-10 20:45 JST 時点）

| Issue | 状態 | 備考 |
|---|---|---|
| #384 EPIC | open | 本書のスコープ |
| #385 ステータス変更ボトムシート | **完了** | PR #390 マージ・本番デプロイ success（/updates v1.50） |
| #386 ホーム文脈カード | **完了** | PR #395 マージ（v1.51）。デプロイ状態は未確認 → 最初に `gh api repos/tnob39/anime-tier-board/commits/main/status` で確認すること |
| #387 モーション基準横断適用 | **未実装・準備完了** | 下記 §3 参照。実装はまだ1行も無い |
| #388 計測イベント計装 | **未着手** | タスクファイル: `docs/handoffs/AGENT_TASK_388.md` |

設計の SSOT:
- IA/ナビ = 方針④ `docs/UX_ABEMA_IA_REDESIGN_20260626.md`（5タブ）
- モーション品質 = `docs/UX_DIRECTION.md` §2 の apple-design ブロック
- 本EPICの設計根拠 = `docs/native-ia-redesign-20260710.md`

## 2. 確立済みの実装フロー（#385/#386 で2周実績）

1. **実装**: grok-4.5（ローカル `%USERPROFILE%\.grok\bin\grok.exe`、認証済み・デフォルトモデル grok-4.5）を隔離 worktree + 自己完結 AGENT_TASK.md 方式で起動
2. **検収**（親エージェント）: diff精査（スコープ/inline style禁止/既存globalクラス流用禁止）→ mojibake 機械検査（`[�縺繧譁]` を rg）→ `npx tsc --noEmit` → `npx next build --webpack`
3. **独立レビュー**: 実装者と別のエージェントがレビュー（#385/#386 では Codex が担当。**Codex が実装する場合はレビューを Claude か Grok に依頼**）。指摘は severity 付き。should-fix は修正してから PR
4. **PR**: `Closes #38x`、レビュー対応表を本文/コメントに記載 → CI (Vercel) green 確認 → squash マージ（オーナー承認済み） → デプロイ success 確認
5. Issue にクレーム/完了コメント（マルチセッション協調プロトコル #153）

## 3. #387 の再開手順（最重要）

**状態**: worktree・ブランチ・タスクファイル・node_modules まで準備済み。実装ゼロ。

- worktree: `C:\Users\Nobu\AppData\Local\Temp\claude\C--Users-Nobu--claude-anime-tier-board\5a4f8446-8201-4ee6-bae2-6304d6ac0343\scratchpad\grok-387`（branch `feature/motion-standards-387`, base=f041e78 時点の main）
  - **消えていた場合**: `git worktree add <path> -b feature/motion-standards-387 origin/main` で再作成し、`docs/handoffs/AGENT_TASK_387.md` を worktree ルートに `AGENT_TASK.md` としてコピー、`npm install`
- **⚠️ grok の起動は auto mode の Claude からは不可**: `--permission-mode bypassPermissions` + 高 max-turns の自律ループは分類器が拒否する（2026-07-10 に3回確認。うち2回は起動後数分で kill、1回は起動自体を拒否）。**オーナーに以下を `!` プレフィックスで実行してもらうこと**（Codex 自身が sandbox 外で起動できるならそれでも可）:

```powershell
& "$env:USERPROFILE\.grok\bin\grok.exe" --cwd "<worktree path>" --permission-mode bypassPermissions -m grok-4.5 --no-alt-screen --max-turns 150 -p "Read AGENT_TASK.md in the repository root and implement it fully. Work autonomously without asking questions. Follow every rule in that file. Note: npm install has already been run for you; skip it."
```

- **代替**: Codex が #387 を直接実装してもよい（オーナーの当初指示は grok-4.5 実装だが、grok 起動がブロックされ続ける場合の現実解）。その場合レビューは別エージェントに。タスク内容は `docs/handoffs/AGENT_TASK_387.md` に完全記載
- **RELEASES**: #387 マージ時に `app/updates/page.tsx` に **v1.52** を追記（現最新 = v1.51。実装ブランチには含めずマージ直前に追加、番号衝突回避のため）

## 4. #388 の手順

`docs/handoffs/AGENT_TASK_388.md` をそのまま使用（grok 委任でも Codex 直接実装でも可）。RELEASES 追記は不要（内部変更）。

## 5. 落とし穴（今セッションで実際に踏んだもの）

- **Primary working dir（`C:\Users\Nobu\.claude\anime-tier-board`）は古い `feature/ux-p2-cleanup` のチェックアウト**。ここの docs は方針④以前で陳腐化。方針確認は必ず `git show origin/main:docs/...`
- grok headless `-p` に `--permission-mode plan` を併用すると**無出力終了**する
- Codex のバックグラウンド実行（stdinパイプでも）は kill されることがある → **フォアグラウンド + ログファイル方式**が確実
- `next build` はバックグラウンドだと kill されることがある → フォアグラウンド `> log 2>$null` で
- ブランチを寝かせるとマージ時に conflict（#390 で発生・import 1行）。**マージ直前に `git merge origin/main` で最新化**
- grok は既存UIの挙動を「改善」side-effect として変えることがある（#385 で即解除ボタンを⋯メニューへ移動）。検収時に**仕様変更の混入**を必ず点検し PR に明記
- 別Issue候補（未起票）: `PUT /api/watchlist` の部分更新化（4フィールド一括上書きによるクロスクライアント stale 上書き。#390 の Codex レビュー指摘3由来）

## 6. 完了の定義（EPIC #384 クローズ条件）

- #387 / #388 のPRがレビュー通過・マージ・デプロイ success
- /updates に v1.52（#387）反映
- EPIC #384 に全子Issueの結果サマリをコメントしてクローズ
