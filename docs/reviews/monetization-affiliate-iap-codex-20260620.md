# レビュー: 課金・アフィリエイト実装計画（Codex second opinion）

**対象**: `plans/monetization-affiliate-iap-implementation-plan-20260620.md`  
**比較対象**: `docs/reviews/monetization-affiliate-iap-claude-20260620.md`  
**レビュー日**: 2026-06-20  
**判定**: 方向性は妥当。ただし Phase 1 の前提に、現コードと一致しない箇所が複数ある。特に「存在しない API / native 画面 / 参照ドキュメント」を実装計画の依存にしている点は、着手前に修正が必要。

---

## 主要指摘

### 1. `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` が存在しない

計画は関連ドキュメントと完了条件で `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` を参照しているが、この worktree には存在せず、`git ls-files` にもない。完了条件が「Phase 1 のタスクがすべてこの文書に反映されていること」になっているため、現状のままだと完了判定不能。

**根拠**
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:7`
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:127`

**推奨**
- 正しい既存ドキュメント名に直すか、該当ドキュメントを追加する。
- もし native MVP 計画が別 worktree にあるなら、この PR/branch に取り込むまで本計画の完了条件にしない。

### 2. `/api/subscriptions/diagnosis` は現状存在しない

計画は「`/api/subscriptions/diagnosis` のレスポンスにアフィリエイトリンクを含める」としているが、現状の API route は `app/api/subscriptions/route.ts` だけで、`diagnosis` サブルートはない。実体は server page 側で `calcSubscriptionStats()` を呼び、`SubscriptionsClient` に渡す構成。

これは Claude レビューの「diagnosis は `recommendedServiceId` を返す」という提案より手前の問題で、まず「既存画面に組み込む」のか「新 API を作る」のかを決める必要がある。

**根拠**
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:79`
- `app/subscriptions/page.tsx`
- `lib/subscription-stats.ts`
- `app/api/subscriptions/route.ts`

**推奨**
- Web だけなら、まず `calcSubscriptionStats()` の `additionalServices` 表示に CTA を追加するのが最小。
- Native と共有するなら、新設 API は `/api/subscriptions/diagnosis` で妥当。ただしタスク名を「既存 API のレスポンス拡張」ではなく「診断 API 新設」に修正する。
- API には生の affiliate URL ではなく `recommendedServiceId` と redirect URL だけを返す方針に寄せる。ここは Claude に同意。

### 3. Native 側の `subscriptions.tsx` が存在しない

計画は「Native側の `subscriptions.tsx` でリンクを表示」としているが、`apps/native/src/app` には `index.tsx`, `tonight.tsx`, `explore.tsx`, `watchlist.tsx`, `_layout.tsx` しかない。native 側の API client にも subscription/diagnosis 取得関数はない。

Phase 1 に native 表示まで含めるなら、これは小さな文言追加ではなく、タブ/ルート追加、API client、認証付き fetch、UI、空状態、リンク外部起動まで含む新機能になる。

**根拠**
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:80`
- `apps/native/src/app`
- `apps/native/src/lib/api-client.ts`

**推奨**
- 夏アニメ MVP で確実に切るなら Phase 1a は Web/PWA の `/subscriptions` のみ。
- Native は Phase 1b として「subscription diagnosis screen 新設」と明記し、工数を別に見積もる。

### 4. `/api/subscriptions` の native 対応は未完了で、Phase 1 の前提にできない

計画は `/api/subscriptions` の native 対応を「すでに計画済み」として軽く扱っているが、現コードは `auth()` 直呼びで Bearer token を見ない。`requireUserId()` は存在するため移行先はあるが、まだ適用されていない。

Claude の指摘に同意。ただし「作業重複の解消」だけでは足りず、affiliate/native 診断 API より先にこの移行をブロッカーとして置くべき。

**根拠**
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:83`
- `app/api/subscriptions/route.ts:12`
- `app/api/subscriptions/route.ts:29`
- `lib/api/auth-helpers.ts:7`

**推奨**
- Phase 1 の最初の受け入れ条件に「`/api/subscriptions` が Cookie session と Bearer token の両方で GET/POST できる」を追加する。
- `app/api/statuses` など既存 native 対応済み route と同じエラーラッパー/認証パターンに合わせる。

### 5. `StreamingService` の affiliate フィールドは既にあるため、タスク1の表現が古い

計画は `lib/streaming-services.ts` に `affiliateUrl` を追加すると書いているが、現状の `StreamingService` には `affiliateUrl` と `affiliateTag` が既にある。全サービス `null` で、`getServiceUrl()` は `affiliateUrl` を返すだけ。

Claude の「既存型に集約」には同意。一方で「公式URLフォールバック」は、現状 `StreamingService` に公式URLフィールドがないため、そのままでは実装できない。`officialUrl` を足すか、`affiliateUrl` を「外部リンク先 URL」として扱うかを決める必要がある。

**根拠**
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:75`
- `lib/streaming-services.ts:10`
- `lib/streaming-services.ts:11`
- `lib/streaming-services.ts:80`

**推奨**
- タスク1を「affiliate/official URL の値埋めと URL builder 追加」に修正する。
- `affiliateTag` を URL 合成に使うなら、サービスごとの tag 付与方式が違う前提で `buildServiceOutboundUrl(serviceId, source)` のような関数に閉じ込める。

### 6. Phase 2 の `user_subscriptions` は既存テーブルと衝突する

これは Claude の指摘に完全同意。`user_subscriptions` は配信サービス契約保存に既に使われている。IAP/プレミアム権限の保存先としては使えない。

**根拠**
- `plans/monetization-affiliate-iap-implementation-plan-20260620.md:99`
- `lib/subscriptions.ts:22`
- `lib/subscriptions.ts:110`

**推奨**
- `user_entitlements` か `user_premium_entitlements` に変更する。
- `subscription` という語はこのコードベースでは配信サービス契約を指すため、IAP には使わない。

### 7. 既存コードに mojibake が残っており、収益化導線前に直すべき

計画ファイルと Claude レビューは UTF-8 として読めるが、実コードには mojibake が残っている。特に `lib/streaming-services.ts` のサービス名、native 画面の日本語文言、`requireUserId()` のエラー文が該当する。アフィリエイト CTA は信頼性が重要なので、リンク追加前に表示文言の文字化けを直すべき。

**根拠**
- `lib/streaming-services.ts:45`
- `lib/streaming-services.ts:54`
- `lib/api/auth-helpers.ts:20`
- `apps/native/src/app/watchlist.tsx`

**推奨**
- affiliate 実装の前提タスクに「関連画面/API エラー文の mojibake 修正」を入れる。
- 少なくともサブスク診断、native auth、native watchlist 周辺は先に修正する。

---

## Claude レビューへの同意/差分

**同意**
- アフィリエイト優先、IAP 後回しという大方針は妥当。
- `user_subscriptions` ではなく `user_entitlements` 系のテーブル名にすべき。
- 生 affiliate URL をアニメごとに撒かず、redirect endpoint 経由にする提案は妥当。
- `/api/subscriptions` の `requireUserId()` 移行は必要。
- IAP は RevenueCat webhook を信頼源にし、サーバ側 entitlement 判定へ寄せるべき。

**補足/不同意**
- Claude は `/api/subscriptions/diagnosis` を前提に議論しているが、現コードにはその route がない。新設 API なのか既存 server page ロジックの再利用なのかを先に明記すべき。
- `affiliateUrl` null 時の公式URLフォールバック案は方向性としてはよいが、現型には `officialUrl` がないため、追加フィールドまたは意味変更が必要。
- Native `subscriptions.tsx` の存在を前提にした計画は修正が必要。現 native app には該当画面がなく、Phase 1 の工数が過小評価されている。
- 「クリック計測を Phase 1 に入れる」提案には概ね同意するが、最初は永続ログよりも redirect endpoint + source パラメータ設計までで十分。DB 集計まで入れると夏 MVP のスコープを膨らませる。

---

## 修正版 Phase 1 案

1. 参照ドキュメントを修正する  
   `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` の所在を確定し、存在しないなら作成または参照削除。

2. 認証前提を整える  
   `/api/subscriptions` を `requireUserId()` に移行し、Cookie/Bearer 両対応を確認。

3. URL モデルを確定する  
   `StreamingService` に `officialUrl` を追加するか、`affiliateUrl` の意味を「outboundUrl」に変える。`buildServiceOutboundUrl(serviceId, source)` を追加。

4. Web/PWA のサブスク診断にだけ CTA を出す  
   `additionalServices` の推奨サービス単位に限定し、全カードやホームには出さない。

5. Redirect endpoint を追加する  
   `GET /api/go/affiliate?service=<id>&src=subscription-diagnosis` を追加。Phase 1 では 302 と source パラメータ設計まで。クリック永続化は後続でもよい。

6. Native は別タスク化する  
   native subscription diagnosis screen/API client は Phase 1b として切り出す。既存画面がないため、Phase 1a の完了条件に入れない。

---

## 最終判断

この計画は「アフィリエイト中心で夏に間に合わせる」というプロダクト判断は正しい。ただし、現状の実装計画は既に存在するものと存在しないものを取り違えているため、このまま Issue 化すると見積もりと完了条件が崩れる。

着手前に最低限、次の4点を計画へ反映することを推奨する。

- `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` 参照の修正。
- `/api/subscriptions/diagnosis` を新設 API として扱うか、既存 `/subscriptions` server page に閉じるかの決定。
- Native `subscriptions.tsx` 前提の削除または Phase 1b 化。
- `user_subscriptions` を IAP 用に使わないことの明記。
