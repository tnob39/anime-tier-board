import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約 — numanie",
  description:
    "numanie（個人開発プロジェクト）の利用規約（暫定版）。個人利用前提・禁止行為・無保証を定めます。",
};

const SECTION_STYLE: CSSProperties = {
  marginTop: 20,
};

const LIST_STYLE: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 20,
  lineHeight: 1.7,
};

export default function TermsPage() {
  return (
    <div className="feedback-main">
      <header className="feedback-header">
        <Link href="/" className="feedback-back">
          ← ホームへ
        </Link>
        <h1>利用規約</h1>
        <p>
          運営主体: numanie（個人開発プロジェクト） / 施行日: 2026-08-23
        </p>
      </header>

      <div className="feedback-notice" role="note">
        <p>
          本利用規約は暫定版です。専門家確認前の内容を含み、将来改訂されることがあります。法的効果や適法性を断定するものではありません。
        </p>
      </div>

      <article className="feedback-panel">
        <section style={SECTION_STYLE} aria-labelledby="terms-service">
          <h2 id="terms-service">1. サービス内容</h2>
          <p>
            numanie は、アニメの視聴整理・Tier 表・ウォッチリスト等を個人利用向けに提供する Web
            サービスです。個人開発プロジェクトとして運用しており、商用の大規模サービス品質を保証しません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="terms-personal">
          <h2 id="terms-personal">2. 個人利用について</h2>
          <p>
            本サービスは個人の視聴管理を主目的とします。アカウントの売買、無断の再販、過度な自動化による負荷、他者へのなりすまし等は想定していません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="terms-prohibited">
          <h2 id="terms-prohibited">3. 禁止行為</h2>
          <ul style={LIST_STYLE}>
            <li>法令または公序良俗に反する行為</li>
            <li>他の利用者や第三者の権利・プライバシーを侵害する行為</li>
            <li>サービスや関連インフラへの不正アクセス、妨害、過度な負荷</li>
            <li>虚偽情報の登録、なりすまし、セキュリティ機能の回避</li>
            <li>秘密情報・認証情報・個人情報の無断投稿（フィードバック含む）</li>
            <li>本サービスの運営を妨げる行為、および運営が不適切と判断する行為</li>
          </ul>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="terms-rights">
          <h2 id="terms-rights">4. 権利帰属</h2>
          <p>
            本サービス上のソフトウェア、デザイン、文章等のうち運営が作成した部分に関する権利は、運営（numanie）または正当な権利者に帰属します。作品タイトル・画像・メタデータ等の権利は、各権利者および提供元に帰属します。AniList、MyAnimeList、Jikan、TMDb、Google
            等との公式提携・後援はありません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="terms-disclaimer">
          <h2 id="terms-disclaimer">5. 無保証・責任制限</h2>
          <p>
            本サービスは現状有姿（AS IS）で提供します。可用性、正確性、完全性、特定目的適合性、データ保持の永続性について保証しません。利用により生じた損害について、法令上免責が認められない場合を除き、運営は責任を負いません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="terms-changes">
          <h2 id="terms-changes">6. 改訂</h2>
          <p>
            本規約は必要に応じて改訂します。重要な変更がある場合は、サービス上での表示など合理的な方法で周知します。改訂後も利用を継続した場合、改訂内容に同意したものとして取り扱うことがあります。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="terms-contact">
          <h2 id="terms-contact">7. お問い合わせ</h2>
          <p>
            利用規約に関する問い合わせの公式窓口は
            <Link href="/feedback">利用者の声（/feedback）</Link>
            です。案内は
            <Link href="/contact">お問い合わせページ</Link>
            を参照してください。
          </p>
        </section>
      </article>
    </div>
  );
}
