# 実験: Codex vs Grok — 同一仕様(S1)の実装比較

> **目的**: 同一の自己完結ハンドオフ（`docs/handoffs/CODEX_S1_watchlist_v2.md`）を Codex と Grok の両方に実装させ、**今後の実装委任の判断材料**（品質・忠実度・速度・コスト・文字化け・制約遵守）を得る。
> **日付**: 2026-06-26 / **オーナー**: Nobu / **対象機能**: S1 = `WatchlistClientV2`（設定トグル切替・バックエンド無変更）

---

## 1. セットアップ（公平性の担保）

| 項目 | 内容 |
|------|------|
| 共通仕様 | `docs/handoffs/CODEX_S1_watchlist_v2.md`（両者同一・改変しない） |
| ビジュアル | `docs/mockups/watchlist-abema-mock.html` |
| 派生元 | 両ブランチとも `docs/ux-abema-ia-redesign`（handoff/mock を含む）から分岐 |
| Codex | ブランチ `codex/s1-watchlist-v2` / Issue: #(codex) / PR base = `docs/ux-abema-ia-redesign` |
| Grok | ブランチ `grok/s1-watchlist-v2` / Issue: #(grok) / PR base = `docs/ux-abema-ia-redesign` |
| 隔離 | それぞれ独立 worktree。互いのコードは見せない |

PR の base を docs ブランチにすることで、**各 PR の diff = そのエージェントの実装のみ**になり比較しやすい。

## 2. 実行経路（このリポの確立パターン）

- **Codex**: `dispatch.ps1 -To codex -CodexSandbox workspace-write -CodexCwd <codex-worktree> -Task "<ASCII短文: read handoff & implement>"`
  - `codex exec --ephemeral --sandbox workspace-write` で実ファイル編集。
- **Grok**: ローカル grok CLI を worktree 上で書き込み権限で実行（VPS/hermes-grok 経路は不可: plan固定＋VPSにリポ無しで無応答終了 — `[[feedback_grok_build_silent_failure_on_file_refs]]`）。

## 3. 既知のエージェント注意（メモリ由来・検証時に必ず確認）

- **Codex 文字化け**: Windows 経由の書き込みで日本語が mojibake 化するが tsc/build は通る。受領後 `rg "縺|繝|ｱ|ｦ|莉|謾|蛻"` で検査し目視確認（`[[feedback_codex_mojibake_windows]]`）。
- **Grok 配信**: プロンプト未送信・無応答終了の前例あり。起動後に状態確認（`[[feedback_grok_prompt_delivery_verification]]`）。
- **委任プロンプト**: 短い ASCII 指示＋handoff 参照。長い日本語直打ちは破損する（`[[feedback_terminal_send_japanese_mojibake]]`）。

## 4. 評価軸（PR受領後に記入）

| 軸 | Codex | Grok |
|----|-------|------|
| 受け入れ条件の充足（ハンドオフ §6 のチェック数） | _/7 | _/7 |
| 制約遵守（V1/lib/statuses/api 無変更・新規ファイルのみ） | | |
| `npx tsc --noEmit` / `npm run build` | | |
| 実機動作（トグルON/OFF・編集シート・進捗） | | |
| 文字化け（mojibake）の有無 | | |
| コード品質（再利用・簡潔さ・命名・スタイル分離） | | |
| 想定外の差分・余計な変更 | | |
| 所要時間 | | |
| 追加修正の手数（Claude が直した量） | | |
| 総評（今後どちらに委任するか） | | |

## 5. 進め方・役割分担

1. 両エージェントに実装させ、各自 commit。可能なら各自 PR 作成（`PRも分けて作成させる`方針）。
2. エージェントが PR 作成まで到達しない場合は **Claude が検証→必要な修正→commit→PR 作成**を代行（PR本文に「<agent> 実装・Claude 検証」と明記）。
3. **無断 main マージはしない**（`[[feedback_self_merge_without_permission]]`）。比較レビュー後にオーナーが選択。
4. 採用しなかった方のブランチ/PR は記録として残すか close する（このdocに結果を残す）。

## 6. 結果（記入欄）

- Codex PR: #___ / 所感:
- Grok PR: #___ / 所感:
- 採用: ___ / 理由:
- 学び（今後の委任ルールへ反映）:
