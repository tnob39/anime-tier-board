# 方針③ N1-N4 レビュー完全版

対象:
- `docs/UX_DIRECTION.md`
- `plans/ux-policy3-n1-n4-plan-20260619.md`
- 関連実コード（`components/TierBoardApp.tsx`, `app/watchlist/watchlist-client.tsx`, `lib/subscription-stats.ts` ほか）

結論:
- N1 は現状のままだと大きすぎる。特に「モード撤去」と「ホーム=カレンダー化」は同一マージでもよいが、同一コミット/同一PR内の一括変更は避け、N1a/N1b/N1c に分けて段階検証すべき。
- `TierBoardApp` は pro 固定で大きな simple 専用機能喪失は見当たらない。ただし simple で隠していた操作群が一気に露出するため、方針③の「シンプル優先」との UI 密度リスクがある。
- 独占「ここだけ」は、現在のデータだけでは「自分が加入しているサービス内でここだけ」に限定して表現するのが安全。「他の全サービスでは不可」という意味の独占は TMDb flatrate 全体・未対応サービス・Amazon Channels 等の前提を明確にしないと誤表示になる。

---

## 先の `UX_DIRECTION.md` 整合性レビュー 3件

### D1. 方針③後の Issue 対応表・着手順が古い

(a) 評価/懸念:
`docs/UX_DIRECTION.md` の Issue 対応表と推奨着手順が、方針③で追加された `ui-mode` 撤去、`/subscriptions` 統合、ホーム=カレンダー、右上ホームアイコン削除を直接扱っていない。古い #61/#65 子Issueの流れだけを見ると、撤回済みの simple/pro 方向や旧ホーム案へ戻るリスクがある。

(b) severity: important

(c) 具体的推奨:
方針③専用の Issue 群（N1-N4）を `docs/UX_DIRECTION.md` に追記し、既存の #61/#65 表は「過去方針/関連Issue」として格下げする。推奨着手順も `N1a -> N1b -> N1c -> N2/N3/N4` に置き換える。

### D2. 方針①の旧IA表が方針③と競合している

(a) 評価/懸念:
`docs/UX_DIRECTION.md` の方針①には `/` = 視聴中ホーム、`/subscriptions` = サブスク、`/watchlist` = 視聴中という旧IA表が残っている。後段で方針③が上書きすると書いてあるが、source of truth としては同一文書内に競合表がある状態。

(b) severity: important

(c) 具体的推奨:
旧IA表を「履歴」と明示し、現在有効な IA は方針③のみに集約する。最低限、表の直前に「この表は方針③により廃止済み」と太字で入れる。

### D3. プリフェッチ調査メモの「ログイン時のみ」が不正確

(a) 評価/懸念:
`lib/use-seasonal-prefetch.ts` は `HomeClient` だけでなく `HomeGuest` からも呼ばれている。正確には「SSR seed はログイン済みホームのみ、client prefetch はゲストホームでも実行」。

(b) severity: nice

(c) 具体的推奨:
section 7 の記述を「ログイン済みホームでは SSR データ seed + prefetch、ゲストホームでは seed なし prefetch」に修正する。

---

## Codexレビュー観点 6点への回答

### 1. N1 の分割粒度。モード撤去とホーム=カレンダー化を同梱すべきか

(a) 評価/懸念:
N1 は基盤として先行単独マージする方針自体は妥当。ただし現在の N1 は、`lib/ui-mode.tsx` 撤去、`app/providers.tsx` 変更、`MobileNav` 再構成、`settings`/`HamburgerMenu` UI削除、`home-client`/`home-simple`/`home-pro` 統合、`WeeklyBroadcastCalendar` 抽出、`watchlist` 回帰維持、`GlobalNav` ホームアイコン削除、`TierBoardApp` の `isSimple` 撤去まで含む。これはレビュー単位として大きい。

特に「モード撤去」と「ホーム=カレンダー化」は依存しているが、同時に壊れると原因分離が難しい。実コード上も `useUiMode` 消費は `app/home-client.tsx`, `app/providers.tsx`, `app/settings/settings-client.tsx`, `components/HamburgerMenu.tsx`, `components/MobileNav.tsx`, `components/TierBoardApp.tsx` に散っており、ホーム変更とは別の回帰面を持つ。

(b) severity: blocker

(c) 具体的推奨:
N1 を次の3段に分ける。

- N1a: モード撤去・単一ナビ化のみ。`MobileNav` は `ホーム/Tier/分析/さがす` 固定、`settings` と `HamburgerMenu` のモードUI削除、`UiModeProvider` 除去、`TierBoardApp` は pro 相当へ固定。ただしホーム表示は一旦既存のどちらかに寄せるか、最小限の暫定表示に留める。
- N1b: `WeeklyBroadcastCalendar` 抽出と `watchlist` 回帰維持。ホームにはまだ載せず、抽出だけで見た目・挙動を比較する。
- N1c: ホーム=カレンダー化。`app/page.tsx` / `home-client` 系の再構成、空状態導線の仮置き、カードタップ導線を実装する。

マージは N1a -> N1b -> N1c の順が安全。ユーザー体験として一気に出したい場合でも、PR内コミットとレビュー観点は分けるべき。

### 2. `WeeklyBroadcastCalendar` 抽出の回帰リスク低減策

(a) 評価/懸念:
抽出対象は単なる JSX ではない。`app/watchlist/watchlist-client.tsx` 内で `visibleItems -> calendarItems(watching/plannedのみ) -> groupItemsByBroadcastDay -> WeeklyBroadcastCalendar` の流れになっている。依存は `BROADCAST_WEEKDAYS`, `BroadcastWeekday`, `getBroadcastDayLabel`, `extractWeekdayLabel`, `normalizeBroadcastDay`, `CardLane`, `LaneCardData`, 今日レーンへの `scrollIntoView`。この境界を曖昧に切ると、watchlist の既存カレンダーが壊れる。

(b) severity: important

(c) 具体的推奨:
抽出は2層に分ける。

- `lib/broadcast-calendar.ts`: `BROADCAST_WEEKDAYS`, `BroadcastWeekday`, `normalizeBroadcastDay`, `getBroadcastDayLabel`, `groupItemsByBroadcastDay` を移す。入力は `AnimeStatusRecord[]`、出力は `Record<BroadcastWeekday, AnimeStatusRecord[]>`。
- `components/WeeklyBroadcastCalendar.tsx`: 表示だけを担当。`grouped`, `onItemClick?`, `className?`, `heading?` を props 化し、watchlist と home で同じ部品を使う。

回帰確認は最低限、`watching/planned` だけ表示されること、曜日順が月-日で維持されること、`nextEpisode.airingAt` 優先、`broadcastDay` fallback、今日レーンのハイライト/スクロール、アイテムゼロ時は `null` を維持することを確認する。ユニットテストを入れるなら `groupItemsByBroadcastDay` に集中させる。

### 3. `TierBoardApp` の `isSimple` 撤去で pro 固定にして良いか

(a) 評価/懸念:
pro 固定でよい。実コード上、`components/TierBoardApp.tsx` の `isSimple` は `mode === "simple"` から作られ、simple 時に一部操作を隠す用途だけに使われている。simple でしか表示される独自要素は見当たらない。

pro 固定で露出する要素は以下。

- 年セレクト: `components/TierBoardApp.tsx` の年フィールド。
- 期セレクト: 同じく season フィールド。
- 表示フィルター: `映画OFF`, `旧作OFF`。
- 自動配置ボタン: `handleAutoPublicTier` を呼ぶ強調ボタン。表示文言は現状「出刃表」になっており、別途文言確認が必要。
- リセットボタン。
- Tier追加ボタン。

一方で simple 時にも `再取得` と `共有` は表示され、Tier lane 自体も `editable` で、rename/color/delete/move/status 操作は渡っている。つまり simple は完全な閲覧モードではなく、主に上部コントロールと Tier 追加を隠す軽量モードだった。

懸念は「失われる simple 専用機能」ではなく「simple で隠していた複雑操作が新しい単一UIに出過ぎる」こと。方針③はシンプル優先なので、pro 固定というより「単一UIとして何を一軍表示するか」を再選別する必要がある。

(b) severity: important

(c) 具体的推奨:
`useUiMode` と `isSimple` は撤去してよいが、pro の全操作をそのまま常時表示するのは避ける。

- 常時表示: 年/期、再取得、共有。
- 二次操作へ格納: 映画OFF、旧作OFF、自動配置、リセット、Tier追加。少なくともモバイルでは `...` メニューか折りたたみへ寄せる。
- `isSimple` 削除後に `useUiMode` import が完全に消えることを `rg "useUiMode|UiMode|isSimple"` で確認する。
- 「出刃表」は意図した文言でない可能性が高いため、N1とは別でもよいが修正候補に入れる。

### 4. `/subscriptions` -> `/dashboard` 統合の段階・後方互換

(a) 評価/懸念:
N3a -> N3b -> N3c の段階は妥当。ただし後方互換は計画より広い。現状 `/subscriptions` への導線は `MobileNav`, `HamburgerMenu`, `settings-client`, `dashboard-client`, `explore-client`, `updates`, `dashboard/changelog-section`, `manifest.ts` に存在する。PWA shortcut も `/subscriptions` を指している。

また `SubscriptionsClient` はクエリ更新で `router.replace("/subscriptions?...")` を使っているため、単純 redirect 後にコードを残すと内部状態URLが古いままになる。共有URLというより、既存ブックマーク・PWA shortcut・更新履歴リンク・設定/探索内リンクの扱いが主な後方互換。

(b) severity: important

(c) 具体的推奨:
N3a で `/subscriptions` は server redirect だけ先に入れる。ただし同時に以下を行う。

- `app/manifest.ts` の shortcut URL を `/dashboard` に変更し、名前も「分析」または「サブスク分析」に寄せる。
- `settings-client`, `explore-client`, `dashboard-client`, `HamburgerMenu` の `/subscriptions` リンクを `/dashboard` に変更する。
- `updates` や changelog の過去リンクは履歴として残す選択もあり。ただし redirect で到達できることを確認する。
- `/api/subscriptions` は設定保存APIなので残す。ページルート `/subscriptions` だけを redirect 対象にする。
- `/dashboard?section=subscriptions` のような anchor/クエリを用意すると、旧導線からサブスク分析セクションへ着地させやすい。

### 5. 独占「ここだけ」算出ロジックの妥当性とデータ前提

(a) 評価/懸念:
計画の「各作品の配信プロバイダ集合から、加入サブスクのみで視聴可（=他では不可）」は曖昧。現在の `calcSubscriptionStats` は `getAnimeTmdbProviderIds` で TMDb JP flatrate、AniList `streamingPlatforms`, `streamingEpisodes` fallback を providerId 集合へ寄せている。加入サービスは `STREAMING_SERVICES` の TMDb provider IDs だけが対象。

このデータで安全に言えるのは「登録済みの加入サービス群の中では、このサービスだけがカバーしている」まで。未対応サービス、TV局系、都度課金、配信URL fallback の alias 誤判定、Amazon Prime と dアニメ Amazon Channel の混在、Hulu/Disney+ を1サービス扱いしている点を考えると、「世の中の全サービスでここだけ」は言い切れない。

(b) severity: blocker

(c) 具体的推奨:
用語を明確に分ける。

- 表示名は「加入中サービス内でここだけ」または「あなたのサブスクではここだけ」にする。
- 算出は `subscribedCoverage` を使い、各 anime について加入中 service のうち match する service が1つだけなら exclusive とする。
- 「他サービスでも配信あり」は TMDb flatrate 全体の providerIds と比較できる場合だけ補足表示に留める。
- fallback 由来（AniList platform/episode alias）の providerIds は信頼度を下げるか、`source: "tmdb" | "fallback"` を持たせる。独占判定は原則 TMDb flatrate に限定するのが安全。
- `STREAMING_SERVICES` に未登録の TMDb provider が `anime.streamingProvidersJp.flatrate` に含まれる場合、「ここだけ」から除外するか「加入中ではここだけ」と表現する。

### 6. N1-N4 の順序・並行性、見落としている波及

(a) 評価/懸念:
大枠の順序は妥当だが、並行性の記述に危険がある。N4 の SSR seed/sessionStorage は一部独立に見えるが、N1 がホーム構造とカード導線を変えるため、ホーム側 prefetch の呼び出し位置・seed のキー・カード押下の対象が変わる。N4 を N1 と完全並行させると二重実装や競合が出る。

見落としやすい波及:
- `anime-tier-board:uiMode` localStorage は削除しなくても動作上は害が少ないが、設定復活時の誤読や検証混乱を避けるなら migration/ignore 方針を明記する。
- `app/providers.tsx` から `UiModeProvider` を外すと、`useUiMode` 残存は即 runtime/build error になる。`rg` の受け入れ条件が必要。
- CSS に `.ui-mode-*`, `.hamburger-mode-*`, `.home-pro-*`, モード別コメントが残る。機能には影響しないが、方針③後の保守ノイズになる。
- native app 側に同名概念や watchlist 表示がある。今回 Web 方針なら対象外と明記する。
- PWA `manifest.ts` の `/subscriptions` shortcut、`start_url: "/"` の意味変更、アプリ説明文の「サブスク管理」表現。
- `/dashboard` は未ログイン redirect と `subscriptionState.onboardingDone` による `/onboarding` redirect がある。サブスク分析統合後も、分析を見る前に必ずサブスク onboarding へ飛ぶ設計でよいか再確認が必要。
- N2 の localStorage 初回表示は、N1 の `anime-tier-board:uiMode` 撤去と同時に storage 方針を整理しないと、不要キーが増える。
- `WeeklyBroadcastCalendar` は現状 `visibleItems.length` がある時だけ呼ばれる。ホームでは「visible はあるが calendarItems はゼロ」のケースに空チュートリアルを出すのか、watchlist 同様 null にするのか決める必要がある。

(b) severity: important

(c) 具体的推奨:
順序を次に変更する。

1. N1a: モード撤去・単一ナビ・GlobalNav ホームアイコン削除。
2. N1b: カレンダー抽出のみ。watchlist 回帰確認。
3. N1c: ホーム=カレンダー化。カードタップ導線と空状態の暫定仕様を入れる。
4. N4a: `/tier` SSR seed と sessionStorage cache。N1c 後に merge するか、N1c のホーム変更に触れない範囲に限定する。
5. N2: 初回チュートリアル。N1c の空状態仕様を上書きする。
6. N3a/N3b/N3c: dashboard/subscriptions 統合。N3d は「旧 subscriptions page 整理」ではなく、統合後に残す部品の CSS/不要機能整理として扱う。

受け入れ条件に `rg "useUiMode|UiMode|anime-tier-board:uiMode|/subscriptions"` の確認を入れる。ただし `/api/subscriptions` と履歴リンクは意図的残存として例外リスト化する。

---

## プラン本文への具体的な修正案

- N1 の見出しを「N1a モード撤去」「N1b カレンダー抽出」「N1c ホーム=カレンダー」に分割する。
- N1 の `TierBoardApp` は「pro固定」ではなく「単一UI化。simpleで隠していた操作を一軍/二軍に再配置」と書く。
- N2 は N1c 後に固定。`HomeAddSection` 流用はよいが、カレンダー空状態と未登録状態の条件を先に定義する。
- N3 の独占は「加入中サービス内の独占」と表現を限定する。全サービス独占と誤読される文言は避ける。
- N4 は「SSR seed/sessionStorage は N1 と並行可」ではなく「ホーム導線に触れない範囲のみ並行可。merge は N1c 後推奨」に弱める。
- 後方互換の対象に `manifest.ts`, `settings-client`, `explore-client`, `dashboard-client`, `HamburgerMenu`, `updates`, `dashboard/changelog-section` を明記する。

