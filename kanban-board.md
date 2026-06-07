# Kanban Board — Current Project（Orca + Multi-Agent 可視化）

**Board Owner**: Hermes Orchestrator（loher）
**Primary Coding Agent**: grok-composer-2.5-fast
**更新**: 2026-06-07

> エージェント向け Orca 操作ガイド: [`ORCA_GUIDE.md`](./ORCA_GUIDE.md)

## ボード構成

### Todo
- [ ] 次回放送カレンダー機能の設計（視聴管理ページにセクション追加）
- [ ] airing データ取得ロジックの調査（AniList/Jikan）
- [ ] composer-dev → main マージ（explore-client.tsx コンフリクト解消）
- [ ] feature-new-features → main マージ（composer-dev 先行後）

### In Progress
- [ ] image-proxy → hotlink 移行（`shared.ts` 変更済み・ビルド確認中）
- [ ] TMDb Watch Providers のカード表示 polish（composer-dev）

### Review / Testing
- [ ] Codex によるフィルタ機能のテスト容易性レビュー

### Done
- [x] サブスク最適化（subscription-optimizer）— main にマージ済み（2026-06-07）
- [x] 布教カード（evangelist-card）— main にマージ済み（2026-06-07）
- [x] image-proxy → hotlink 移行 — `lib/anime-sources/shared.ts` の1行変更で完了（2026-06-07）
- [x] origin/main push — 6c06bba まで push 済み（2026-06-07）
- [x] 視聴管理ページへのカレンダーセクション追加（c63c0db）
- [x] TMDb seasonal enrich + flatrate 表示（686a9c1）
- [x] Explore「今すぐ見放題」フィルタ（1ade115）
- [x] explore-client 再レビュー（claude-review: 2 P1 対応済み）
- [x] orca-cli skill グローバルインストール
- [x] Orca Activity Dashboard 作成
- [x] streamingProvidersJp の基本表示ロジック（既存）
- [x] ORCA_GUIDE.md 作成
- [x] AGENTS.md / CLAUDE.md 作成（エージェント自動読み込み用）
- [x] orca/AUTOMATIONS.md + setup-orca-automations.ps1 作成
- [x] worktrees/composer-dev.md ミニガイド作成
- [x] worktrees/claude-review.md ミニガイド作成
- [x] Orca Automations 4件登録（disabled・手動テスト待ち）
- [x] 全 worktree へドキュメント同期

## Agent 割り当て状況

| Task | Assignee | Status | Orca Worktree |
|------|----------|--------|---------------|
| Orca ドキュメント整備 | grok-composer-2.5-fast | Done | main (git-state-active) |
| Explore フィルタ | grok-composer-2.5-fast | Done | main（1ade115） |
| 次回放送カレンダー | grok-composer-2.5-fast | Todo | calendar-next-airing（予定） |
| TMDb UI統合全体 | grok-composer-2.5-fast | In Progress | composer-dev |
| explore-client レビュー | Claude Code | Done（再レビュー済） | claude-review |
| サブスク最適化 | Claude Code | **Done（main マージ済み）** | subscription-optimizer |
| 布教カード | Claude Code | **Done（main マージ済み）** | evangelist-card |
| image-proxy → hotlink 移行 | Claude Code | **Done（shared.ts 変更）** | main |

---

この看板は Orca の worktree と連動して更新していきます。
各エージェントが実際にどのタスクを担当しているかが一目でわかる状態を目指します。
