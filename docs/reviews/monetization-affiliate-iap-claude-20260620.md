# レビュー: 課金・アフィリエイト実装計画（Claude Code）

**対象**: `plans/monetization-affiliate-iap-implementation-plan-20260620.md`
**レビュー者**: Claude Code (Opus 4.8)
**日付**: 2026-06-20
**判定**: 方向性は妥当。ただし「コードの追加必要度」を過大評価しており、真の長ポールは別にある。命名衝突1件・設計ガードレール複数を要修正。

---

## 総評

アフィリエイト先行 / IAP 後回しという方向性は妥当。一方で、計画が「実装コスト高」とした項目の多くは**既存コードに構造が存在**し、実際のボトルネックは**アフィリエイト提携の審査リードタイム（非コード）**にある。

---

## 1. スコープの妥当性 — 概ね妥当だが真のブロッカーが抜けている

- アフィリエイト先行は適切（追加コスト小、後述の通り構造は既存）。夏に間に合う。
- IAP の Phase 2 後回しも適切。IAP は「売る機能の定義（未定）＋RevenueCat＋課金DB＋ストア商品設定＋審査強化＋手数料15–30%」と重く、夏に不要。
- **抜けている真のブロッカー = アフィリエイト提携の審査リードタイム**:
  - Amazon アソシエイト（180日以内に成果必要）、A8.net / バリューコマース（U-NEXT・dアニメ・ABEMA・Hulu|Disney+ 系）。各社の提携審査に数日〜数週。
  - → **今すぐ並行で申請開始**を Phase 1 に明記すべき。夏の実質締切を決めるのはここ。
- クリック計測を Phase 2 に全部回すのは危険。AniList 商用ライセンス条件（月収$150超）の証明・ROI 把握に最低限のタグ付けが要る（`affiliateTag` フィールドは既存）。

## 2. 技術的実現性

### `lib/streaming-services.ts` — 既存構造に完全適合（実質実装済み）

- **重要発見**: `StreamingService` 型に **`affiliateUrl: string | null` / `affiliateTag: string | null` が既に定義済み**。`getServiceUrl()` ヘルパーも存在（全サービス現状 `null`）。
- → タスク1「リンク追加（追加必要度: 高）」の実態は**データ投入のみ**。構造変更不要 → 必要度「低」。
- **`lib/affiliate-links.ts` 新規作成（代替案）は非推奨**。service id / TMDb provider id と密結合の情報が二重管理になる。`STREAMING_SERVICES` を単一の真実源に保つ。
- 推奨追加: `buildAffiliateUrl(serviceId)` を新設し `affiliateUrl + affiliateTag` を合成。**`affiliateUrl` が null の間は素の公式URLにフォールバック**（提携承認前でもリンクが死なない）。

### RevenueCat を Expo / Capacitor 両対応する推奨構成

- ライブラリ: Expo=`react-native-purchases`（Expo Go 不可、dev client/EAS build 必須）/ Capacitor=`@revenuecat/purchases-capacitor`。
- 推奨アーキテクチャ（単一の真実源化）:
  1. 両アプリのネイティブ層で RevenueCat 購入 → RevenueCat Entitlements を正とする。
  2. **RevenueCat Webhook → 自前 `/api/iap/webhook`** で課金DBに同期（クライアント非信頼）。
  3. ゲートはサーバ側 `requireEntitlement('premium')` に集約 → Expo も Capacitor も同じ API 判定。
- **Capacitor 固有の落とし穴**: WebView 内の Web JS から**ネイティブ IAP は呼べない**。プレミアム購入UIは**ネイティブブリッジ画面**にする必要がある。Phase 2 前に要決定。

## 3. API 設計

### diagnosis レスポンスにアフィリエイトリンクを含める — 条件付きで妥当

- 「最も追加カバーするサービス」推奨CTAに**推奨サービスのみ**リンクを付けるのは妥当。
- **アニメ毎の大きなリスト全件に affiliate URL を埋めない**（ペイロード肥大＋提携タグの不要な露出）。
- **推奨: アフィリエイト専用リダイレクト endpoint** `GET /api/go/affiliate?service=unext&src=diagnosis` → タグ付きURLへ 302。
  - 利点: (a) クリック計測（$150ライセンス証明に直結）、(b) アプリ更新なしでタグ差し替え、(c) JSON に生URLを撒かない。
  - → Phase 2 の「クリック計測」を今ほぼ無料で前倒し可能。diagnosis は `recommendedServiceId` を返し、リンクはこの redirect 経由に。

### 課金状態管理の最小テーブル設計（既存パターン準拠）

- **命名衝突**: 計画の `user_subscriptions` は**既に配信サービス契約用に存在**。流用不可 → **`user_entitlements`** に改名必須。
- このリポジトリは**マイグレーションファイルを使わず** `ensureSubscriptionSchema()` 方式（`create table if not exists` + module-level promise ガード）。同パターンで `ensureEntitlementSchema()` を作る:

```sql
create table if not exists user_entitlements (
  user_id        text primary key,
  entitlement    text    not null default 'free',  -- 'free' | 'premium'
  store          text,                              -- 'app_store' | 'play' | null
  rc_app_user_id text,                              -- RevenueCat app user id
  product_id     text,
  expires_at     integer,                           -- unix ms, null=lifetime/none
  is_active      integer not null default 0,
  updated_at     integer not null
);
```

- 判定: `is_active=1 and (expires_at is null or expires_at > now)`。
- MVP は1ユーザー1行（最新状態）で十分。監査が要る段階で append-only `entitlement_events` を追加。

## 4. リスク（アフィリエイト前面化の離脱）— 中程度だが設計次第で十分低い

- 低churnで済む条件（このアプリは満たしやすい）: 表示は**サブスク診断の文脈のみ**（意図一致）/ 中立コピー（煽りなし）/ インタースティシャル無し・カード毎の乱貼り無し。
- churnが跳ねる条件（避ける）: ホーム/Tier/全カードに常時表示、煽りコピー、**報酬額順での推奨並べ替え**。
- **最重要ガードレール**: 推奨順位は**カバー本数（客観）で固定**し、affiliate は「客観的に選ばれたサービスに付くリンク」に留める。手数料で並べ替えた瞬間に信頼が崩れる。
- 定量感: 単一配置・意図一致のため churn は実質軽微。リスクは離脱より**コンバージョン低下**（提携未承認・既加入ユーザー）側。

---

## 改善提案（具体）

1. **命名衝突修正**: Phase2 テーブル `user_subscriptions` → `user_entitlements`。
2. **`/api/go/affiliate` リダイレクト endpoint を Phase 1 に追加**（計測・タグ差替・ライセンス証明を安価に解決）。「クリック計測」を Phase 2→Phase 1-lite に再分類。
3. **affiliate データは `streaming-services.ts` に集約**（`affiliate-links.ts` 新設は却下）。`buildAffiliateUrl()` ＋ null時は公式URLフォールバック。
4. **非コードのブロッカー節を追加**: Amazon アソシエイト / A8.net・バリューコマース提携申請を今すぐ並行開始。
5. **Capacitor IAP 制約を明記**: WebView 内 Web JS から IAP 不可 → 購入UIはネイティブブリッジ画面。
6. **diagnosis は `recommendedServiceId` を返し、リンクは redirect 経由**。生 affiliate URL を全アニメに撒かない。
7. **ランキングは coverage 固定・手数料順禁止**をドキュメントに明文化。
8. **作業重複の解消**: `/api/subscriptions` の `requireUserId()` 移行は本計画と NATIVE_SUMMER_MVP_PLAN の両方に記載 → 担当を一本化。

---

## 検証根拠（参照した既存コード）

- `lib/streaming-services.ts`: `affiliateUrl`/`affiliateTag` フィールド + `getServiceUrl()` 既存（値は全 null）。
- `app/api/subscriptions/route.ts`: 現状 `auth()` 直呼び（native Bearer 非対応 → `requireUserId()` 移行の前提を確認）。
- `lib/subscriptions.ts`: `ensureSubscriptionSchema()` による lazy `create table if not exists` 方式。`user_subscriptions` テーブルが既存（命名衝突の根拠）。
