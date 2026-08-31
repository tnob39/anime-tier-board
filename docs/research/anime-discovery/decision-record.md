# Decision record — Screenshot recognition Stage A

Issue: #760  
Parent: #759  
Fixed base: `7b3de096d33ee8e7c025ff73072d1191cfc0f308`  
Reviewed on: 2026-08-31  
Implementer: Grok 4.6（Fable 不使用）

## 判断

**`PERMISSION_REQUIRED`**

Screenshot MVP の production 接続は開始しない。fixture 契約・validation・metrics harness は Stage A として成立する。

## なぜ GO ではないか

#759 Go 条件は次を要求する。

- production 利用可能な source 契約、または自前合法 index 経路
- fixture 評価と privacy 設計の合格
- 認識後の視聴管理・正規配信までの接続

本ゲートで満たすのは 2 番目のみ。1 番目は未充足（allowed source 0、自前合法indexなし）。3 番目は forbidden（production route 接続禁止）のため未着手。

## なぜ NO_GO ではないか

#759 Stop 条件のうち、現時点で該当して Stage A 自体を捨てるものは次のとおり整理する。

| Stop 条件 | 判定 |
|-----------|------|
| 商用・保持・再配布が不明 | 該当。そのため **production を開始しない**。Stage A 文書化は可能 |
| 本編無断収集が前提 | 非該当。`unauthorized-full-episode-index` は prohibited。実装しない |
| 画像削除 / abuse / 地域法が実装不能 | Stage A は保存しないので削除対象なし。live 化前に再評価 |
| 声紋本人識別が MVP 必須 | 非該当。scope 外 |

fixture adapter は production integration なしで契約できる。ToS を推測で allowed にしていない。

## Source ごとの production 可否

| source | decision | production |
|--------|----------|------------|
| trace-moe | permission-required | no |
| anilist（認識経路） | permission-required | no |
| jikan | unknown | no |
| official-pv | permission-required | no |
| unauthorized-full-episode-index | prohibited | no |

## Stage B に進む前の必須許諾

1. **trace.moe**: help@trace.moe から商用利用、画像保持、preview 再表示、rate/SLA、帰属の書面。または利用しない
2. **公式PV自前index**: 権利者からの指紋化許諾（対象作品、保存、再配布、地域）。YouTube からの download は ToS 上書面許諾が別途必要
3. **AniList**: competing tracker 条項の適用可否と、$150/月超の commercial license
4. **Jikan**: ToS 本文の再取得。欠落が続くなら MAL 公式 API のみを検討し、Jikan は使わない
5. **違法画像・CSAM**: live upload 前に報告義務とブロック設計の法務確認

いずれかが未了のまま external runtime を on にしない。

## Stage A で完了した範囲

- permission ledger（根拠URL・確認日・production 可否）
- privacy / threat model
- provider-neutral fixture contract
- deterministic metrics harness（known/no-match/ambiguous/malformed/oversized/timeout/provider-failure）
- unknown / permission-required / prohibited / absent の runtime 利用不能
- raw image を log/artifact に書かない
