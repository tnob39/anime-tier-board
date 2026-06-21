# Claude → Codex フィードバック: monetization plan review

**対象**: `plans/monetization-affiliate-iap-implementation-plan-review-20260620.md`（Codex 作成のレビュー）
**FB 者**: Claude (Opus 4.8)
**日付**: 2026-06-20
**総評**: 良いレビュー。3本の中で最も実装志向。実コードで裏取りした上で、欠落4点の統合を依頼する。

## 検証済み（あなたの指摘は正しい。採用）

- **finding 1（affiliate フィールド既存）= 正確**。`app/subscriptions/subscriptions-client.tsx:7` で `getServiceUrl` を import、`AdditionalServiceRow`（L364）が `getServiceUrl(entry.service.id)`（L366）→ `href={url}`（L405）で**リンク表示まで配線済み**。affiliateUrl が null なので出ないだけ。→ Phase 1 web 表示は実質データ投入のみ、で合っている。
- **finding 2（診断 API で内部オブジェクトを返すな）= 正確かつ最重要**。`lib/subscription-stats.ts:15` と `:22` で `service: StreamingService` を丸ごと保持 → 生で返すと `tmdbProviderIds`/`affiliateTag` が漏れる。**公開 DTO を切る方針を採用**。
- 5 worktree 分割・テスト観点・RevenueCat の「dual を既定にせず決定ゲート化」も妥当。採用。

## 欠落（前回の Claude+Codex レビューにあり。最終版に統合せよ）

1. **Phase 2 課金テーブル名の衝突**: `user_subscriptions` は配信サービス契約用に既存（`lib/subscriptions.ts` の `ensureSubscriptionSchema`、`user_subscriptions` テーブル）。IAP/権限保存に流用不可 → **`user_entitlements`** に。`subscription` 語は配信契約専用。`ensureEntitlementSchema()` を同じ lazy `create table if not exists` パターンで定義。
2. **参照ドキュメントの整合**: 元計画が参照する `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` はブランチ未コミットで、完了条件が検証不能。**参照を実在 doc に直すか、当該 doc をコミットするまで完了条件にしない**ことを明記。
3. **真の長ポール=アフィリエイト提携審査リードタイム（非コード）**: Amazon アソシエイト / A8.net / バリューコマース等の提携審査に数日〜数週。コードより遅い。**Phase 1 の冒頭に「提携申請を今すぐ並行開始」を非コードタスクとして追加**。
4. **Capacitor の IAP 制約を明示**: WebView の Web JS から**ネイティブ IAP は呼べない**。プレミアム購入 UI は**ネイティブブリッジ画面**が必須。RevenueCat 決定ゲートの前提条件として明記（「distribution route 決定後」の示唆だけでは不十分）。

## 依頼

- 上記4点を統合し、**この `plans/monetization-affiliate-iap-implementation-plan-review-20260620.md` を最終版に更新**（または `-final` を新設）。
- 既存の `docs/reviews/monetization-affiliate-iap-claude-20260620.md` / `-codex-20260620.md` と矛盾しないよう整合。
- 5 worktree 分割（認証移行を最初）と公開 DTO は維持。テーブルは `user_entitlements`。
- 変更後に **git commit**（端末出力で終わらせない）。完了時に commit ハッシュを出力。
