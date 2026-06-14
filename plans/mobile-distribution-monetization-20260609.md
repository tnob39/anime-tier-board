# モバイル配信・収益化・競合対策 — 設計メモ

作成日: 2026-06-09
更新日: 2026-06-14 (Issue #82 確定)

> 2026-06-14 更新: Issue #82 にて Expo + EAS Build に確定。
> Capacitor 推奨（旧 Grok 案）は Windows 環境で iOS ビルド不可のため却下。

## 決定事項サマリー

| 項目 | 決定 |
|------|------|
| モバイル配信 | Expo + EAS Build（全面ネイティブ）。PWA は Web 側で維持 |
| ビルド方式 | EAS クラウドビルド（Mac 不要・Windows 対応） |
| コードベース | turborepo（apps/web + apps/native） |
| 先行プラットフォーム | iOS 先行 → Android |
| 収益主軸 | 配信サービスアフィリエイト。ディスプレイ広告は当面なし |
| ストア申請の前提 | AniList 商用ライセンス（月収 $150 超）、Privacy Policy / Terms |

## ロードマップ（Expo+EAS 確定版）

- Phase A: PWA — 完了 (v1.7)
- Phase B: Expo/EAS セットアップ — Track B (#84/#85/#86/#87) Nobu 手動
- Phase C: 全面 RN 移植 — Track C (#89-#95) Codex 委任

## なぜ Expo + EAS か（旧 Capacitor 案の却下理由）

- Capacitor は Xcode/Mac が必須 → Windows 単独では iOS リリース不可
- EAS クラウドビルドで Mac なしに iOS .ipa を生成可能
- 真のネイティブ品質（プッシュ通知・ウィジェット）
- 移植コスト（Next.js → RN）は Codex 委任で吸収

## 収益化方針（変更なし）

1. 配信サービスアフィリエイト（affiliateUrl 枠活用）
2. 季節スポンサー枠
3. Ko-fi / プレミアム機能
4. AdSense（月 UU 1 万超から）
5. AdMob（iOS/Android リリース後）

## 関連 Issues

- #82: Expo vs Capacitor 方針確定 (Closed)
- #84-#87: Track B（Nobu 手動）
- #89-#95: Track C（Codex 委任）

旧 Capacitor 案の詳細は git log で参照可。