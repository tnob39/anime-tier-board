# UIUX_RECONSIDERATION_20260711 — IA / 表示設定の現行決定記録

> **位置づけ**: モバイル IA・表示設定（Visual / Simple）に関する **現行の決定記録 / ガードレール**（この主題の正本）。
> 実装が撤回済みの 4 タブや simple/pro IA 分岐を復活させないためのガードレール。
> **IA・ナビの詳細正本**は [UX_ABEMA_IA_REDESIGN_20260626.md](./UX_ABEMA_IA_REDESIGN_20260626.md)。[UX_DIRECTION.md](./UX_DIRECTION.md) は横断の入口・索引であり、全 UIUX の単一正本ではない。
> **決定日**: 2026-07-19 / **決定者**: Nobu（オーナー）
> **関連**: [UX_DIRECTION.md](./UX_DIRECTION.md) / [UX_ABEMA_IA_REDESIGN_20260626.md](./UX_ABEMA_IA_REDESIGN_20260626.md) / [PRODUCT_CONCEPT.md](./PRODUCT_CONCEPT.md)

---

## 1. 決定サマリ（現行）

| 項目 | 現行決定 |
|------|----------|
| モバイル底部ナビ | **5 タブ固定**: ホーム / Tier / さがす / マイリスト / マイページ |
| 分析 `/dashboard` | 底部ナビに置かない。**マイページ経由**で到達する |
| 方針③ 4 タブ（ホーム/Tier/分析/さがす） | **履歴**。実装の参照元にしない |
| simple/pro による IA・ナビ分岐 | **撤回済み**。アーキテクチャとして復活させない |
| Visual / Simple | **同一機能の表示設定**（IA 分岐ではない） |
| Simple の画像 | **画像 HTTP リクエストを発生させない**。空の画像スロットも残さない |

---

## 2. 根拠・証拠（Evidence）

本記録は以下の既存決定・Issue・実装痕跡を横断して整理したもの。新規の製品判断をここで発明しない。

| 根拠 | 内容 |
|------|------|
| 方針④（2026-06-26） | Abema 型 5 タブ IA。マイリスト昇格・マイページ採用・分析の底部降格。EPIC [#211](https://github.com/tnob39/anime-tier-board/issues/211) |
| Design Spike [#413](https://github.com/tnob39/anime-tier-board/issues/413) | 方針③（4 タブ）と方針④（5 タブ）・PRODUCT_CONCEPT の simple/pro 記述が同一ブランチ上で競合していることを明示。SSOT 整理が Phase 1 成果物 |
| 実装 EPIC [#417](https://github.com/tnob39/anime-tier-board/issues/417) | 5 タブを前提に本番実装へ移す。Visual / Simple を同一機能の表示モードとして定義。Home 集約 API・原子的 progress 等の **後続バックエンド契約** を EPIC 側で要求 |
| Home API 子タスク [#447](https://github.com/tnob39/anime-tier-board/issues/447) | `GET /api/home` 等は方針④ §6（2026-06-26 時点の Watchlist S1 向け「バックエンド無変更」）とは別レイヤの契約 |
| コード痕跡 | `components/display-mode/` に Visual / Simple トグルが存在。旧 `lib/ui-mode.tsx` の simple/pro IA 分岐は方針③で撤去済み（方針④も単一 IA を維持） |

---

## 3. 採用 / 却下テーブル

| 案 | 判定 | 理由 |
|----|------|------|
| **5 タブ**（ホーム / Tier / さがす / マイリスト / マイページ） | **採用（現行）** | 方針④・#211。視聴管理の直行と「その他」受け皿を両立 |
| 方針③ **4 タブ**（ホーム / Tier / 分析 / さがす）・watchlist 非タブ | **却下（履歴）** | 方針④で撤回。分析は日常導線から遠い問題をマイページ経由で解消する方針へ |
| simple/pro で **ナビ・ホーム IA を分岐** | **却下（履歴）** | 方針③でモード統合。二重メンタルモデルと実装分岐コストが残る |
| Visual / Simple を **別アプリ IA** として再導入 | **却下** | 機能差ではなく表示差。IA・ルート・主要 CTA は共通 |
| Visual / Simple を **同一機能の表示設定** とする | **採用（現行）** | #417 定義。Simple は画像 HTTP なし・空画像枠なし。操作・到達機能は Visual と同等 |
| `/dashboard` を底部タブに戻す | **却下** | 方針④どおりマイページ配下。サマリー + 「詳細」導線 |
| 方針④ §6 を「全画面・全 API で永続的にバックエンド不要」と読む | **却下** | 対象は 2026-06-26 時点の Watchlist S1 表示刷新に限定。Home 集約・原子的 progress 等は #417 / #447 系の後続契約 |

---

## 4. 実装ガードレール（必守）

実装・レビュー・委任時に次を守る。違反しそうなら先に本記録と `UX_DIRECTION.md` を更新して合意する。

1. **底部ナビを 4 タブや simple/pro 別タブに戻さない。** 正規ラベルとルートは
   `ホーム` `/` · `Tier` `/tier` · `さがす` `/explore` · `マイリスト` `/watchlist` · `マイページ` `/mypage`。
2. **`/dashboard` を MobileNav に載せない。** 到達はマイページ（または同等の集約導線）から。
3. **Visual / Simple は表示設定のみ。**
   - **IA・ルート・利用可能な操作を変えない**（タブ構成や hidden CTA の出し分けに使わない）。
   - 同じ画面・同じ操作・同じ API 結果を使う。
   - Simple: **作品画像の HTTP リクエストを出さない**。**空の画像プレースホルダ領域を残さない**（縦リスト等へ再構成）。
   - Visual: 画像を識別補助として表示。カード全体を操作対象にする。
4. **旧ドキュメントの「現行」「最優先」表現に引きずられない。**
   - 方針③・N1–N4・4 タブ・simple/pro IA は **履歴**。
   - IA・ナビの現行正本は [方針④](./UX_ABEMA_IA_REDESIGN_20260626.md)。表示設定・採用/却下・ガードレールの現行正本は本記録 §1・§3・§4。`UX_DIRECTION.md` は入口・索引。
5. **方針④ §6 の「バックエンド無変更」を Home / progress API に拡張適用しない。**
   Watchlist S1 当時の範囲に限定し、後続 API は #417 / #447 等の契約に従う。
6. **存在しない SSOT ファイルを canonical と称さない。**
   未コミット・未作成の screen spec / backend contract ファイル名を「既に正本」と書かない。契約が必要なら Issue 本文または後続 PR で実ファイルを追加する。
7. **日本語 UI 文言は UTF-8。** 文字化け（mojibake）をコミットしない。

---

## 5. 関連 Issue（正リンク）

| Issue | 役割 |
|-------|------|
| [#211](https://github.com/tnob39/anime-tier-board/issues/211) | 方針④ EPIC（5 タブ IA / マイリスト昇格 / マイページ） |
| [#413](https://github.com/tnob39/anime-tier-board/issues/413) | UX LAB / Design Spike（SSOT 整理・比較検証。本記録の親スパイク） |
| [#417](https://github.com/tnob39/anime-tier-board/issues/417) | UIUX 再設計の本番実装 EPIC（Next Action・Simple 表示・状態・API） |
| [#447](https://github.com/tnob39/anime-tier-board/issues/447) | `GET /api/home` + deterministic next-action（#417 配下のバックエンド契約タスク） |

---

## 6. ドキュメント整合（本タスクで揃える範囲）

| ファイル | 期待状態 |
|----------|----------|
| 本ファイル | IA 5 タブ・Visual/Simple・却下履歴の **現行決定記録** |
| `UX_DIRECTION.md` | 方針④を現行、方針③および N1–N4 を履歴。旧 4 タブ表記をナビ仕様に使わない |
| `UX_ABEMA_IA_REDESIGN_20260626.md` | 5 タブ決定を維持。§6 のバックエンド無変更は S1 当時スコープに限定 |
| `PRODUCT_CONCEPT.md` | ペルソナは残す。simple/pro を現行アーキテクチャとして扱わない |

---

## 7. 変更履歴

- 2026-07-19: 初版。#413 SSOT 整理として、5 タブ現行・方針③/ simple-pro IA の履歴化・Visual/Simple 表示設定・実装ガードレールを記録。
