# Privacy / threat model — screenshot recognition (Stage A)

Pinned SHA: `7b3de096d33ee8e7c025ff73072d1191cfc0f308`  
Reviewed: 2026-08-31  
Issue: #760

Stage A は **画像を保存しない・外部へ送らない**。以下は次ステージに進む前の必須制御。実装済みのものは `lib/anime-recognition/` を参照。

## 入力契約

| 項目 | 方針 | Stage A 実装 |
|------|------|----------------|
| 入力 | binary upload または fixture ID のみ。URL fetch は拒否（SSRF） | fixture / in-memory bytes のみ。`kind: "url"` は型に存在しない |
| サイズ | 上限 2 MiB（`ANIME_RECOGNITION_MAX_BYTES`） | oversized を reject |
| 画素 | 幅/高 4096、総画素 8_000_000 | image_bomb を reject |
| 形式 | JPEG / PNG / WebP のみ | magic bytes + 申告 MIME の一致 |
| GIF/BMP/PDF/HTML | 非対応 | unsupported_type |
| EXIF | JPEG APP1 / PNG eXIf / WebP EXIF を除去。除去ペイロードはログに出さない | `validateRecognitionImage` |
| 原画像ログ | 禁止。byteLength / MIME / sha256 hex / fixtureId のみ | `describeInputSafely` |
| artifact | raw bytes / base64 / data URL を書かない | metrics report はメタデータのみ |

## 一時保存と削除

| 項目 | 方針 |
|------|------|
| Stage A | ユーザ画像の保存実装は forbidden。メモリ上の fixture bytes のみ |
| Stage B 以降 | 処理後 **即削除**。残すのは title / episode / from-to / confidence / source / 時刻のみ |
| 上限 TTL（提案・未実装） | 作業メモリ 60 秒、ディスク一時領域を使うなら **15 分かつ処理完了で即削除** |
| 履歴 | 原画像なし。オプトアウトはメタデータ削除 |

## 脅威と制御

| 脅威 | リスク | Stage A 制御 | Stage B 必須 |
|------|--------|--------------|--------------|
| CSAM / 違法画像 | アップロード受付そのものが法的リスク | 受付 UI / 保存 / 外部送信なし | ベンダー検知、違法時は保存せず遮断、法執行手続 |
| SSRF | 画像 URL をサーバが取得 | URL 入力なし | 将来も URL をサーバ側 fetch しない。必要ならクライアントが bytes を送る |
| 画像爆弾 | 小さいファイルが巨大デコード | 2 MiB 上限 + 画素上限（4096 / 8e6） | 実デコード時に `limitInputPixels` とタイムアウト |
| Malware / polyglot | 実行形式や HTML を画像と偽る | magic bytes 必須。拡張子信頼なし | デコード成功を受理条件にする |
| Rate abuse | 認識 API を踏み台 / DoS | 外部 runtime hard-off | 認証ユーザ制限、IP / アカウント quota、課金前は低上限 |
| 外部リーク | ユーザスクリーンショットが第三者へ | fetch 禁止、feature flag hard-off | 許諾済み source のみ。送信内容は必要最小 |
| ログ漏洩 | サポートログに原画像 | safe log に bytes キーなし | analytics イベントにも画像を載せない |
| EXIF GPS | 位置情報が残る | JPEG APP1 / PNG eXIf / WebP EXIF を strip | デコード成功を受理条件にする |
| 誤検出公開 | 低 confidence を断定 | fixture は confidence を返すのみ | UI で断定禁止、確認ステップ必須（#759） |

## ログに書いてよいもの / 書いてはいけないもの

書いてよい: `fixtureId`, `declaredMime`, `detectedMime`, `byteLength`, `sha256Hex`, `exifStripped`, `outcomeStatus`, latency, source id, classification。

書いてはいけない: raw bytes, base64, data URL, EXIF ペイロード, ファイル名（個人が写る可能性）, 画素データ。

## 残課題（権利・運用）

- CSAM スキャナのベンダー選定と保持ゼロの契約
- 地域法（日本・GDPR）の画像処理 DPA
- live upload 時の画素デコード timeout と sharp `limitInputPixels`
