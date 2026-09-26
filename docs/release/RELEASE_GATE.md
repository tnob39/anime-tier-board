# 本番 Release Gate（fail-closed evidence 契約）

Issue: [#742](https://github.com/tnob39/anime-tier-board/issues/742) / Go/No-Go: [#736](https://github.com/tnob39/anime-tier-board/issues/736)

## 目的

固定した release commit に対する**本番実測の証拠**だけを offline 検証し、欠落・自己申告・見本の流用を `NO_GO` にする。validator は network/provider/credential を扱わない。secret 値を JSON に記録しない。

## 本番リハーサル手順

1. 対象 SHA を `releaseCommit`（lowercase 40 hex）として固定する。
2. canonical production URL で guest journey（閲覧・Tier 操作・共有）と auth journey（ログイン・保存・再読込・ログアウト）を desktop/mobile で実行する。
3. 利用する各 production API を ID 一覧にし、health 成功と error telemetry 到達を確認する。console/pageerror、overflow、a11y も確認する。
4. 監視 dashboard、alert destination、error budget、owner、on-call SLA を確認する。宛先へテスト通知を送り、そのログ参照を `health-alert.artifactRef` に記録する。
5. Turso backup の参照を固定し、**使い捨て DB**へ restore、件数・代表レコード・参照整合性を確認する。本番 DB へ restore しない。
6. Vercel で直前 deployment への rollback rehearsal を行い、canonical URL の復旧 smoke 後に対象 release へ戻す。deployment/log 参照を残す。
7. typecheck/build/focused E2E/env checklist を含む全 check に実行日時、担当者 ID、artifact/log 参照を記録する。credential の値は記録しない。
8. 下記 validator を実行し、出力と evidence JSON の参照を #736 Go/No-Go 記録へ添付する。

## 必須 evidence

root 必須項目:

- `releaseCommit`, `executedAt`（ISO-8601 UTC）, `canonicalUrl`（HTTPS origin）, `operator`
- `monitoring.dashboardRef`, `alertDestinationRef`, `errorBudget`, `owner`, `onCallSlaMinutes`
- `checks`, `stopBlockers`, `knownIssues`

必須 check ID:

- 品質: `typecheck`, `build`, `focused-e2e`, `desktop-smoke`, `mobile-smoke`, `a11y`, `console-pageerror`, `overflow`
- 本番導線: `guest-journey`, `auth-journey`
- API/監視: `api-health-error`, `health-alert`
- 復旧: `turso-restore`, `vercel-rollback`
- 構成: `env-checklist`

各 check は `status`, 同一 `commit`, `executedAt`, `operator`, `artifactRef`, `details` が必須。`artifactRef` / `backupRef` / `rollbackDeploymentRef` / `journeyRef` / monitoring の dashboard・alert は `{ path, sha256 }` の実ファイル。加えて `signedManifest` と `detachedSignature`（Ed25519、canonical manifest 署名）と `capacityReport` が必須。capacity payload の `decision` は `GO` で、そのハッシュが署名付き manifest に入っていなければならない。検証鍵 ID・公開鍵は保護された外部 CI/runtime 設定から明示的に受け取り、[`signing-policy.json`](./signing-policy.json) はその値との一致確認にだけ使う。外部 anchor の欠落・不正、未プロビジョニングまたは test-only 鍵では `NO_GO`。journey は canonical URL 確認、API は対象 ID と health/error 監視、Turso は backup/disposable restore/整合性、Vercel は rollback deployment/result を構造化して記録する。

## 判定と Go/No-Go 記入

以下をすべて満たした場合だけ `GO`（exit 0）。欠落、非 pass、SHA 混在、blocker、未解決 critical/security/privacy、必須実在性フィールド不備は `NO_GO`。

`template: true` は内容にかかわらず常に `NO_GO`。したがって [`release-evidence.example.json`](./release-evidence.example.json) は入力形の見本であり、リリース証拠にはならない。実行ごとに別ファイルを作成し、実在する URL/担当者/監視先/artifact/log/restore/rollback 結果へ置換する。

#736 には次を記入する。

- 対象 SHA、実行日時、canonical URL、担当者
- validator の `decision` と evidence artifact 参照
- 監視 dashboard / alert destination / owner / SLA / error budget
- guest/auth/API smoke、Turso restore+integrity、Vercel rollback の artifact 参照と結果
- blocker/known issue の有無、最終承認者、判断日時

どれかを記入できない場合は `NO_GO` とし、補完担当と再判定期限を記録する。

## 実行

```powershell
node scripts/validate-release-evidence.mjs <実在する-evidence.json> --expected-commit <40-hex>
npm run release:validate -- <実在する-evidence.json> --expected-commit <40-hex>
node --test tests/release-evidence-validator.test.mjs
```

引数省略・未知 option・複数 path は nonzero。CLI は入力値、path、blocker 文言、未知 key、SHA、URL、担当者、artifact 参照を出力せず、固定 check ID・件数・固定 reason のみを出す。

### Trusted replay 入力（evidence JSON の外）

validator は **提出 evidence の `releaseCommit` を expected 値に使わない。** 署名済みの古い GO を別 SHA へ replay しても `NO_GO`。trusted 入力は次のみ。

| 項目 | ソース（先勝ち） | 備考 |
|---|---|---|
| expected commit | `--expected-commit` → `ATB_EXPECTED_COMMIT` → `GITHUB_SHA` → `git rev-parse HEAD` | 40 lowercase hex。imported `evaluateReleaseEvidence` は明示必須（env/HEAD を暗黙に読まない） |
| expected environment | `--expected-environment` → `ATB_EXPECTED_ENVIRONMENT` → `production` | manifest `targetEnvironment` と一致必須 |
| generatedAt freshness | `--generated-at-max-age-seconds` → `ATB_GENERATED_AT_MAX_AGE_SECONDS` → CLI 既定 3600 | `generatedAt` は ISO-8601 UTC。未来（60s skew 超）と max-age 超過は `NO_GO`。imported API は `generatedAtMaxAgeMs` 明示必須 |

署名マニフェストは次の exact field allowlist のみを許可する：`schemaVersion`, `targetEnvironment`, `commit`, `generatedAt`, `capacityDecision`, `taskId`, `evidence`。`taskId` は必須で、受理済み task/spec を識別する。release の各 bound artifact（check / journey / backup / rollback / dashboard / alert / capacity-report）は正規化 `{path,sha256,semanticType}` として manifest にちょうど1回現れ、capacity 行は path/hash/type が一致すること。重複 JSON キーは parse 前に拒否する。この allowlist と `taskId` 必須条件は [`CAPACITY_GATE.md`](./CAPACITY_GATE.md)、[`signing-policy.json`](./signing-policy.json)、validator の実装と一致させる。

## 容量ゲート（#745）との接続

詳細正本: [`CAPACITY_GATE.md`](./CAPACITY_GATE.md) / カタログ: [`capacity-limits.catalog.json`](./capacity-limits.catalog.json)

- read と write は分離する。write は fixture のテストデータのみ。実ユーザー mutation は禁止。
- 段階負荷は 1→5→10→25。停止条件は error 率 1%、429、timeout、Turso error、external 増幅。
- 本番負荷は **concurrency 1 の GET smoke のみ**。既定オフ。高並列・長時間は禁止。
- Vercel / Turso プラン上限と想定 SNS 流入がリポジトリで証明できない間は `unknown_blocking` とし、容量判定は `NO_GO`。数値を埋めない。
- SLO: latency 契約値は未証明。alert / error budget / owner / on-call は本 runbook の monitoring 必須項目のまま。容量異常時の rollback は本 runbook の `vercel-rollback` と同じ手順。
- 機械可読レポートは `npm run load:capacity:report`。見本は GO にならない。

#736 Go/No-Go には、#742 の production evidence に加えて capacity-report の `decision` と blocking 上限一覧を添付する。容量が `NO_GO` ならリリースも `NO_GO`。

## 安全境界

- provider 操作や実 smoke/restore/rollback は、この runbook に従い権限を持つ担当者が別途実施する。**ただし、その実施証拠は gate の必須条件であり out-of-scope ではない。**
- validator は credential 値を読まない・保存しない・表示しない。
- commit / push は validator の責務外。
- 容量ゲートは本番へ危険な負荷を掛けない。プラットフォーム上限の未証明値を invent しない。
