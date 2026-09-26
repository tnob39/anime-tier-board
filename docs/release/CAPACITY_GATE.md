# 容量ゲート（fail-closed capacity gate）

Issue: [#745](https://github.com/tnob39/anime-tier-board/issues/745) / Release gate: [#742](https://github.com/tnob39/anime-tier-board/issues/742) / Go/No-Go: [#736](https://github.com/tnob39/anime-tier-board/issues/736)

S1 read harness: PR [#753](https://github.com/tnob39/anime-tier-board/pull/753)

## 目的

本番を危険な負荷に晒さず、ローンチ時の容量・失敗条件・停止基準・rollback 判断を**再実行可能な fixture 試験と機械可読レポート**で固定する。Vercel / Turso のプラン上限や想定 SNS 流入がリポジトリ証拠から証明できない場合は数値を捏造せず `unknown_blocking` とし、容量判定は `NO_GO` のままにする。

## 分離

| 系統 | 対象 | 実装 | 本番 |
|------|------|------|------|
| read | GET `/api/anime/seasonal` 相当 | `scripts/load/read-harness.mjs` + read fixture | 禁止（S1 のまま） |
| write | テストデータ namespace のみ | `scripts/load/write-harness.mjs` + write fixture | **常に禁止** |
| production smoke | 正規 origin の GET のみ | `scripts/load/production-smoke.mjs` | 既定オフ。concurrency 1、最大 5 件、`--allow-production-smoke --execute` が両方必要 |

read と write はサーバー・harness・レポートを分ける。write は `atb-load-test` namespace、`Idempotency-Key`、`X-ATB-Load-Test: 1` 以外を拒否し、終了時に cleanup する。実ユーザーデータの作成・変更・削除は禁止。

## 段階負荷と停止条件

既定 concurrency は **1 → 5 → 10 → 25**。各段で停止条件を評価し、満たしたら以降を発行しない。partial JSON を残す。

停止（即 abort）:

- HTTP 429
- timeout
- Turso error
- エラー率 > 1%
- fixture/local で external call 数 > 0、または external call 数 > started
- メトリクス欠損・非整数・負数
- シグナル（SIGINT / SIGTERM）

write の `rate-limit` シナリオだけは 429 を**確認項目**として記録し、確認後は発行を止めて cleanup する。本番 write の rate limit 実装を主張しない（ソース上は未実装）。

## 記録する指標

各ステップと overall に次を残す。観測できない値は `null`（0 を捏造しない）。

- latency p50 / p95 / p99、throughput、HTTP status、timeout、Turso error、external call 数
- cache hit/miss、cold/warm、fresh / stale / unavailable（read fixture の matrix）
- write: 作成数、idempotent replay 数、rate limit 確認、cleanup 後 remaining

## キャッシュ行列（read）

fixture mode 順: `cold_miss_fresh` → `warm_hit_fresh` → `warm_stale` → `unavailable`。

リポジトリで証明済みのキャッシュ値:

- CDN: `public, s-maxage=300, stale-while-revalidate=86400`
- client TTL: 10 分
- freshness: fresh ≤ 24h、stale ≤ 7d、それ以外 unavailable

## 本番 smoke（低負荷・既定オフ）

1. フラグなし実行はネットワークせず exit 2。
2. `--allow-production-smoke` のみは dry-run 計画を書く。
3. `--allow-production-smoke --execute` だけが正規 origin `https://anime-tier-board.vercel.app` へ GET する。
4. path は `/api/anime/seasonal` のみ。concurrency は 1 固定。requests は 1..5。token / env / write は拒否。
5. 失敗したら即停止。高並列・長時間は禁止。

fixture 試験と CI は `--execute` を使わない。

## プラットフォーム上限と SNS 流入

照合カタログ: [`capacity-limits.catalog.json`](./capacity-limits.catalog.json)

**現時点で unknown_blocking（証明なし・fail-closed）:**

- Vercel request quota / function duration / concurrency / bandwidth
- Turso request / row / storage quota
- 想定 SNS peak concurrency と burst RPS

リポジトリにあるのは Hobby 相当の無料フェーズ料金、KPI 3,000–5,000 MAU、#745 の 2026-08-23 観測（20 req / conc 5 / p95 2.77s）だけである。料金・MAU・単発観測はプラン上限でもバースト想定でもない。外部の公式プラン表または計測済み流入モデルが揃うまで容量 GO にはしない。

## SLO / alert / capacity / rollback

|#742 項目|容量ゲートでの扱い|
|---|---|
|error budget / alert destination / owner / on-call SLA|#742 evidence の必須項目。本カタログでは alert destination 未証明のため blocking|
|latency SLO|未契約。観測 p95 を SLO に昇格しない|
|alert 閾値|harness 停止条件を転用: error 率 1%、429、timeout、Turso error、external 増幅|
|capacity 目安|unknown_blocking が残る間は「未定量」|
|rollback|#742 の Vercel rollback rehearsal。容量異常でも直前 deployment へ戻す。本番高負荷試験は rollback 条件に含めない（実施自体が禁止）|

## 機械可読レポート

```powershell
npm run load:read:fixture
npm run load:write:fixture
npm run load:production-smoke
npm run load:capacity:report
npm run test:load
```

`artifacts/load/capacity-report.json` の `decision` が `GO` になるのは次をすべて満たすときに限る。見本 [`capacity-evidence.example.json`](./capacity-evidence.example.json) と source URL / retrieved_at だけの自己申告は常に `NO_GO`。

- catalog の `unknown_blocking` が1つでも残っていない（`required_for_launch` から外しても blocking は残る）
- ローンチ上限の `proven` は、承認済み root 上の実ファイルを SHA-256 で束縛し、バイトを再計算して payload が当該 limit 値を証明すること。文字列の URL だけでは足りない
- Vercel / Turso / SNS 上限をローカルファイルとして束縛できない間は容量判定は `NO_GO` のまま
- read/write harness も同様に実ファイルへハッシュ束縛する。各 concurrency 1/5/10/25 の step が p50/p95/p99・throughput・status・timeout・Turso・external を持ち、blocking stop がなく、overall は step 合計と一致する
- write は cleanup remaining=0、idempotent replay、rate-limit 確認
- 出力パスは repo の `artifacts/load` またはテスト注入の trusted root に閉じ、途中の symlink / junction / reparse を拒否する。read harness CLI も含む
- **post-validation rename TOCTOU は排除していない。** Node の `fs.rename` は path 指定であり、開いた directory handle 配下の `renameat` は Node/Windows に無い。本番 / release evidence の書き込みは、その primitive が証明されない限り fail-closed（書かない）。fixture / test-only レポートだけが staging temp + 再検証 rename を使ってよく、その経路は GO を許可しない
- SHA-256 は完全性だけ。provenance は切り離し Ed25519 署名。検証鍵 ID・公開鍵は保護された外部 CI/runtime 設定から明示的に受け取り、[`signing-policy.json`](./signing-policy.json) は外部 anchor との一致確認にだけ使う。evidence JSON 内の鍵は使わない。外部 anchor の欠落・不正または policy 不一致は `NO_GO`。秘密鍵はリポジトリ/テスト/ログに置かない
- 署名マニフェストは exact allowlist（`schemaVersion`, `targetEnvironment`, `commit`, `generatedAt`, `capacityDecision`, `taskId`, `evidence[]`）。`taskId` は必須で、受理済み task/spec を識別する。`generatedAt` は UTC かつ trusted freshness 内。evidence 行は正規化 `{path,sha256,semanticType}` の一対一。欠落・余分・重複 path・semantic mismatch は拒否。capacity-report 行は path/hash/type が一致しなければならない
- 現状 `signing-policy.json` は `unprovisioned`。本番 signer がピン留めされ、実署名成果物があるまで容量もリリースも `NO_GO`
- `evaluateCapacity`（imported API を含む）は truthy な `signedManifest` / `detachedSignature` パスだけでは足りず、本番鍵による完全な署名検証が必要。未署名の代替 GO 経路は無い
- JSON の重複オブジェクトキー（ネスト・エスケープ後に衝突するキーを含む）は parse / canonicalization 前に拒否する
- expected 429 は `expected_stop:true` / `http_429` / 観測 429 のみ / timeout・5xx・Turso・external・malformed・signal なし / started=completed=429 件数。nominal は 429 を1件でも拒否

## 安全境界

- 本番への高並列・長時間試験は禁止。
- 実ユーザーデータの mutation は禁止。
- validator / catalog / harness は secret 値を読まない・書かない・出さない。
- プラットフォーム上限の数値を推測して埋めない。
