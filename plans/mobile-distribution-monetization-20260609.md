# モバイル配信・収益化・競合対策 — 設計メモ

作成日: 2026-06-09  
出典: Grok（Cursor）セッションでの検討  
ステータス: 方針確定 → 実装は Phase 順

---

## 決定事項サマリー

| 項目 | 決定 |
|------|------|
| モバイル配信 | **PWA（検証）→ Capacitor ストア版（本番）**。全面ネイティブ（React Native）は不要 |
| 収益の主軸 | **配信サービスアフィリエイト**。ディスプレイ広告は当面なし |
| 広告 | 月 UU 1 万超・テキスト中心ページができてから AdSense / AdMob を検討 |
| クローン対策 | 技術秘匿より **積み上がるユーザーデータ・共有文化・ブランド** |
| ストア申請の前提 | AniList 商用ライセンス（月収 $150 超）、Privacy Policy / Terms |

---

## 1. モバイル配信ロードマップ

### 現状

- Next.js 16 フルスタック（Vercel + Turso + NextAuth Google OAuth）
- モバイル UI あり（`MobileNav`、safe-area、タップ移動）
- PWA・Capacitor・Service Worker は **未実装**

### 推奨 3 段階

```
Phase A: PWA（1週間以内）
  manifest + アイコン + apple-mobile-web-app メタ
  → 「ホームに追加」で擬似アプリ体験・早期収益検証

Phase B: Capacitor ラッパー（2〜3週間）
  WebView → https://anime-tier-board.vercel.app
  + OAuth システムブラウザ（@capacitor/browser）
  + Universal Links / App Links（共有 URL）
  + PNG 保存（@capacitor/filesystem + share）
  → Google Play 先行、iOS はネイティブ付加価値を厚くしてから

Phase C: 全面ネイティブ
  見送り。プッシュ・オフライン・リワード広告が明確に必要になったときのみ再検討
```

### なぜ Capacitor か

- API Routes があるため Next.js の静的エクスポートは不可
- リモート URL 方式なら **Web 変更はストア再審査不要**
- 既存の `affiliateUrl`・モバイル CSS をそのまま活用できる

### 工数・コスト（概算）

| フェーズ | 工数 | 金銭コスト |
|---------|------|-----------|
| PWA | 2〜5 人日 | $0 |
| Capacitor + OAuth + ストア素材 | 2〜3 週間 | Apple $99/年、Google $25 一回、Mac 必須 |
| 全面ネイティブ | 3〜6 ヶ月 | 非推奨 |

### 主な懸念

1. **Apple Guideline 4.2** — 薄い WebView ラッパーはリジェクトされやすい。共有シート・ファイル保存・スプラッシュ等で付加価値を足す
2. **Google OAuth** — WebView 内ログイン禁止。システムブラウザ + カスタム URL スキーム / Universal Links 必須
3. **オフライン非対応** — ストア説明で「要インターネット」を明記
4. **AniList 商用** — ストア + 収益化の前にライセンス確認

---

## 2. 収益化方針（アフィリエイト優先）

### なぜアフィリエイトか

- `/subscriptions`・視聴リストの配信リンクと自然に接続（`lib/streaming-services.ts` の `affiliateUrl` 枠あり）
- Tier 表 UI を壊さない（広告バナーは離脱リスク大）
- 現想定 UU（500〜5,000）では AdSense より成果が出やすい
- PWA / Capacitor どちらでも同じ実装（外部リンク）

### 収益モデル優先順（改訂）

1. **配信サービスアフィリエイト** — `/subscriptions`、視聴リスト配信リンク、共有ページフッター（PR 表記付き）
2. **季節スポンサー枠** — 手動でも可
3. **Ko-fi / プレミアム機能** — 既存ロードマップどおりオプション
4. **AdSense（Web）** — 月 UU 1 万超から検討。Tier 表画面には入れない
5. **AdMob（ストア版）** — Capacitor 導入後・MAU 数千以上で検討

### 実装の次の一歩

- [ ] ASP 登録（U-NEXT、d アニメ、Amazon 等）
- [ ] `affiliateUrl` / `affiliateTag` の差し替え
- [ ] UI に「広告」「PR」表記
- [ ] Privacy Policy に第三者送信・収益化の記載

### ストア × 収益の注意

- アフィリエイトは外部遷移として説明しやすい
- デジタル機能の有料化と外部決済リンクの併用は Apple ルールに注意（プレミアム機能を出す場合は IAP 検討）

---

## 3. 競合・模倣への備え

### 守れないもの（工数をかけない）

- Tier 表 UI コンセプト
- AniList / Jikan 利用（誰でも同 API）
- PWA / Capacitor 構成

### 厚くする堀（優先）

| 優先度 | 施策 |
|--------|------|
| 高 | シーズン跨ぎデータ（Tier・視聴・ダッシュボード）で乗り換えコスト |
| 高 | 共有・OGP・X 文化（`#アニメティア`）、「みんなの Tier 表」集計 |
| 高 | Tier + 視聴 + サブスク + 分析 + 共有の一体化 |
| 中 | 独自ドメイン・商標・Privacy / Terms |
| 中 | API レート制限・利用規約（スクレイピング禁止） |
| 低 | フロント難読化（非推奨） |

### クローンが出たとき

1. 小規模なら無視して開発継続
2. 名前・ロゴ丸パクリのみ商標・規約で対応
3. 自社は集計ページ・シーズンキャンペーンで差を広げる

---

## 4. 既存ドキュメントとの関係

| ファイル | 役割 |
|----------|------|
| [MONETIZATION_ROADMAP.md](../MONETIZATION_ROADMAP.md) | フェーズ別 KPI・チェックリスト（本メモで収益優先順を改訂） |
| [plans/subscription-optimizer-20260607.md](./subscription-optimizer-20260607.md) | サブスク最適化実装済み。Phase 2 でアフィリエイト URL |
| [PRODUCT_REVIEW_AND_ROADMAP.md](../PRODUCT_REVIEW_AND_ROADMAP.md) | 公開準備・レコメンド・エクスプローラー中長期 |
| [DESIGN.md](../DESIGN.md) | UI 改善（リアクション拡張、詳細シート等） |

---

## 5. GitHub Issues

| # | タイトル | 状態 |
|---|----------|------|
| [#16](https://github.com/tnob39/anime-tier-board/issues/16) | PWA化（manifest + Service Worker） | Open |
| [#15](https://github.com/tnob39/anime-tier-board/issues/15) | 配信アフィリエイト URL + PR表記 | Open |

未起票（着手時に Issue 化）:

- Capacitor ストア版（Android 先行）
- 公開準備: Privacy Policy / Terms（`PRODUCT_REVIEW` と共通）

---

## 6. エージェント向けメモ

- 本タスクは **ドキュメント方針の記録**。コード変更は各 Issue 着手時
- モバイル配信とアフィリエイトは **別 Issue で並行可能**（ファイル所有: manifest は `app/`、Capacitor は将来 `mobile/`）
- `npx tsc --noEmit` / `npm run build` はドキュメントのみの変更では不要