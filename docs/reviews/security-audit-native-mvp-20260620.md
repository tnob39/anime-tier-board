# セキュリティ精査 — ネイティブMVP / 収益化スライス (2026-06-20)

**精査者**: Claude Code (Opus 4.8)
**対象**: #140(`/api/subscriptions` 認証移行) / #141(診断API) / #15(アフィリエイト outbound) ＋ ネイティブ認証(#123) ＋ Capacitor 方針
**結論**: 新規コード(#140/#141)はクリーン。#15 は要修正。**最大リスクは既存のネイティブ認証(#123)** で、Capacitor MVP がこれを直接引き継ぐ。

---

## 🔴 CRITICAL — Google IDトークンの audience 検証フェイルオープン（#123）

**場所**: `lib/api/native-auth.ts` `verifyGoogleIdToken`
```js
if (allowedClientIds.length > 0 && (!payload.aud || !allowedClientIds.includes(payload.aud))) { throw }
```
**問題**: `allowedClientIds`（`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_NATIVE_ID`/`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`）が空だと `aud` チェックを丸ごとスキップ。env 未設定のデプロイで黙って無効化される。`email_verified` も未検証。
**影響**: 他アプリ向けに発行された Google IDトークンを replay → **アカウント乗っ取り（confused deputy）**。
**対応案**:
- `allowedClientIds` が空なら**フェイルクローズ（即拒否＋起動時/CI で env 必須チェック）**。
- `aud` を必須化（payload.aud 無ければ拒否）。
- `email_verified === "true"` を検証。
- 望ましくは tokeninfo エンドポイント依存をやめ、google-auth-library 等で署名・iss(`accounts.google.com`)・aud・exp をローカル検証。
**追跡**: #123

## 🟠 HIGH — ネイティブトークンが30日・失効不能・Webセッション等価（#123）

**場所**: `createNativeSessionToken`（`salt: SESSION_COOKIE_NAME`・同 secret・`maxAge 30日`）
**問題**: Bearer トークン＝NextAuth セッション cookie と同一物。`jti`/サーバ側セッション/denylist が無く、漏洩トークンは30日フル権限・`AUTH_SECRET` ローテ以外で失効不能。
**対応案**:
- `jti` を埋め込み、失効テーブル（Turso）で denylist。または短命アクセストークン(数時間)＋refresh の二段構成。
- ネイティブ専用 salt に分離（web cookie と相互利用不可に）。
- Capacitor: secure storage（Keychain/Keystore）必須・localStorage 禁止・HTTPS限定。
**追跡**: #123

## 🟠 MEDIUM-HIGH — オープンリダイレクト（#15・A/B 共通）

**場所**: `app/api/outbound/streaming/route.ts`
```js
destinationUrl = getAffiliateDestinationForService(serviceId) ?? safeTargetUrl  // safeTargetUrl = to= の生URL
```
**問題**: affiliateUrl が null（現状）だと `to=` の任意 http(s) URL へ302。フィッシング/OAuth 誘導に悪用可。
**対応案（B′）**: `to=` 廃止。宛先は `getAffiliateDestinationForService(serviceId) ?? getServiceLandingUrl(serviceId)`（serviceId 起点の許可リストのみ）。該当なしは404。※Codex は `getServiceLandingUrl` を実装済みなのに未使用。
**追跡**: #15

## 🟡 MEDIUM — 未認証DB書き込み濫用（#15・A のみ）

**問題**: `affiliate_outbound_clicks` への INSERT がレート制限なし・未認証 → 連打でDB膨張/コスト増。CREATE TABLE を毎回実行。
**対応案**: Phase1 は DB永続化を入れない（合意どおり）。計測が要るなら後続で、サンプリング/レート制限/別系統で。
**追跡**: #15（B′ で除去）

## 🟡 LOW-MED — `/api/*` の CORS が `*`

**場所**: `next.config.ts` `Access-Control-Allow-Origin: *`（+ Authorization 許可）
**問題**: 認証付きAPIにワイルドカード。多層防御として過大。
**対応案**: `capacitor://localhost`・`https://localhost`・本番ドメイン・Expo dev origin に限定。
**追跡**: 新規Issue（CORS hardening）

## 🔵 Capacitor 着手時の設計要件（#139 / #142）

- `server.allowNavigation` を自ドメイン限定・`server.cleartext=false`（HTTPSのみ）
- トークンは secure storage、WebView localStorage 禁止
- ディープリンクの宛先を allowlist 検証（#142）
- 本番Webに XSS があると native bridge に昇格 → bridge 面を最小化・プラグイン最小
**追跡**: #139（シェル受入条件）・#142（ディープリンク検証）

---

## ✅ 問題なし（確認済み）
- **SQLインジェクション無し**：全クエリ `?` バインドのパラメータ化（`lib/subscriptions.ts`・#15 の INSERT 含む）
- **#140**：POST の `isValidServiceId` 検証は健在、認証移行は `withApiRoute`+`requireUserId` 正規パターン、回帰なし
- **#141**：`userId` はトークン由来＝**IDOR なし**、公開DTO で内部フィールド(`tmdbProviderIds`/`affiliateTag`)非露出
- **devMode 認証**：`NODE_ENV !== "development"` で本番403フェンス済

## 優先順位
1. #123 フェイルオープン aud（最優先・MVP認証の前提）
2. #123 トークン失効設計
3. #15 オープンリダイレクト（B′ で同時対応）
4. CORS 限定
