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

各 check は `status`, 同一 `commit`, `executedAt`, `operator`, `artifactRef`, `details` が必須。journey は canonical URL 確認、API は対象 ID と health/error 監視、Turso は backup/disposable restore/整合性、Vercel は rollback deployment/result を構造化して記録する。

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
node scripts/validate-release-evidence.mjs <実在する-evidence.json>
npm run release:validate -- <実在する-evidence.json>
node --test tests/release-evidence-validator.test.mjs
```

引数省略・未知 option・複数 path は nonzero。CLI は入力値、path、blocker 文言、未知 key、SHA、URL、担当者、artifact 参照を出力せず、固定 check ID・件数・固定 reason のみを出す。

## 安全境界

- provider 操作や実 smoke/restore/rollback は、この runbook に従い権限を持つ担当者が別途実施する。**ただし、その実施証拠は gate の必須条件であり out-of-scope ではない。**
- validator は credential 値を読まない・保存しない・表示しない。
- commit / push は validator の責務外。
