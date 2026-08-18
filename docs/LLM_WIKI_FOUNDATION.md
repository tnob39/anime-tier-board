# LLM Wiki Foundation

## Goal

プロジェクト知識のコンパイル層を導入し、エージェントが小さな index から必要な文脈だけを
ロードできるようにする。設計・handoff・レビュー・計画ドキュメントの全再読を毎回強制しない。

## Recommended Architecture

```text
CLAUDE.md                 # Schema: retrieval / maintenance rules
AGENTS.md                 # Engineering and coordination rules
raw/                      # Immutable external source drops only
wiki/
  index.md                # Primary routing table
  architecture.md         # Stable system model
  current-state.md        # Current priorities and known drift
  sources.md              # Source registry and authority
  log.md                  # Append-only Wiki operations
  components/             # Added incrementally by product area
  decisions/              # ADR-style accepted decisions
```

## Project-Specific Choice

既存の `docs/`・`plans/`・アプリコード・Git 履歴・GitHub Issues/PRs は、すでに一次資料層である。
それらを `raw/` へコピーすると二重の可変コピーと所有権の曖昧さを生む。

したがって:

- `raw/` は書き換え禁止の外部取り込み専用とする。
- 既存リポジトリ文書はその場所に残し、`wiki/sources.md` に登録する。
- `wiki/` は短い合成とルーティングに留め、証拠へリンクする。
- live な GitHub 状態はキャッシュせず、都度照会する。

## Retrieval Model

通常ロード順:

1. `CLAUDE.md`
2. `wiki/index.md`
3. ルーティングされた Wiki ページ 1〜3 枚
4. 関連ソースコード、または live GitHub 状態

これは「毎回、幅広い運用・設計ドキュメントをまとめて読む」以前の起動パターンを置き換える。

## Maintenance Model

### Ingest

ソースを登録 → 既存ページ更新 → リンク追加 → index 更新 → log 追記。

### Query

index からルーティング → 不安定な主張を検証 → ソースパス付きで回答。通常の Query・読み取り専用レビューでは変更せず、必要なら更新候補を提示するだけとする。Wiki 反映は、ユーザーが明示的に Ingest/更新を依頼し、編集許可スコープに wiki が含まれる場合のみ行う。

### Lint

点検項目:

- 壊れた相対リンク
- 古い `updated` 日付
- 歴史資料だけを根拠にした `current` ページ
- 矛盾する現行決定
- 重複ページ / エイリアス
- orphan ページ
- 独立ロードに広すぎるページ

## Rollout

### Phase 1: Foundation（本 Issue #240 の範囲）

- `CLAUDE.md` を Wiki スキーマへ整理する。
- index / architecture / current-state / sources / log と、components・decisions のガイドを置く。
- 初期 Wiki は小さく、一次資料リンク付きに保つ。

### Phase 2: High-Value Components（将来）

タスクで必要になったときだけ追加する候補:

- `wiki/components/home-calendar.md`
- `wiki/components/watchlist.md`
- `wiki/components/tier-board.md`
- `wiki/components/sharing.md`
- `wiki/components/auth-and-data.md`

### Phase 3: Decisions（将来）

オーナー承認済みの制約を ADR 風ページとして `wiki/decisions/` に昇格する。
撤回された決定は削除せず `historical` にする。

### Phase 4: Lightweight Automation（将来）

Wiki が十分大きくなってから:

- link checker
- stale-page report
- orphan-page report
- compact source manifest

index ルーティングが不足するまで vector search や新サービスは導入しない。

## Success Criteria

- 新規エージェントが `wiki/index.md` から関連一次資料へ到達できる。
- 日常タスクで `docs/`・`plans/` の全走査が不要になる。
- Wiki の主張に証拠と鮮度が付いている。
- 新しい決定と再利用可能な調査結果がチャット履歴の外に残る。
- Wiki がソースコーパスより小さく、ロードしやすい。

## External Foundation

- Andrej Karpathy, “LLM Wiki” gist, 2026-04-04:
  `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`
