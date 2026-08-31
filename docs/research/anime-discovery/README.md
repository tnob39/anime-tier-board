# Anime screenshot recognition — Stage A evidence gate

Issue: [#760](https://github.com/tnob39/anime-tier-board/issues/760)  
Parent: [#759](https://github.com/tnob39/anime-tier-board/issues/759)  
Pinned `origin/main` SHA: `7b3de096d33ee8e7c025ff73072d1191cfc0f308`  
Reviewed: 2026-08-31  
Contract: `1.0`

このディレクトリは Anime Discovery Graph の **Stage A（evidence / permission gate）** 成果物である。production route や外部 API 実行は含まない。

| 文書 | 内容 |
|------|------|
| [source-permission-ledger.md](./source-permission-ledger.md) | source 分類と根拠 URL |
| [source-permission-ledger.json](./source-permission-ledger.json) | 機械可読 ledger（lib と drift 検査） |
| [privacy-threat-model.md](./privacy-threat-model.md) | 画像入力の privacy / threat model |
| [decision-record.md](./decision-record.md) | Screenshot MVP の `GO / PERMISSION_REQUIRED / NO_GO` |

Working code: `lib/anime-recognition/`（fixture adapter・validation・metrics harness のみ）。
