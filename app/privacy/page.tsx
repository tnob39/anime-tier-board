import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー — numanie",
  description:
    "numanie（個人開発プロジェクト）のプライバシーポリシー。取得データ・第三者サービス・保持方針の暫定版です。",
};

const SECTION_STYLE: CSSProperties = {
  marginTop: 20,
};

const LIST_STYLE: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 20,
  lineHeight: 1.7,
};

export default function PrivacyPage() {
  return (
    <div className="feedback-main">
      <header className="feedback-header">
        <Link href="/" className="feedback-back">
          ← ホームへ
        </Link>
        <h1>プライバシーポリシー</h1>
        <p>
          運営主体: numanie（個人開発プロジェクト） / 施行日: 2026-08-23
        </p>
      </header>

      <div className="feedback-notice" role="note">
        <p>
          本ページは専門家確認前の暫定版です。保持期間・バックアップ期間・完全削除の可否など、運用確認中の事項を含みます。適法性を断定するものではありません。
        </p>
      </div>

      <article className="feedback-panel">
        <section style={SECTION_STYLE} aria-labelledby="privacy-who">
          <h2 id="privacy-who">1. 運営について</h2>
          <p>
            本サービス「numanie」は、個人開発プロジェクトとして提供しています。商業的な大規模サービスではなく、個人利用を想定したアニメ視聴整理ツールです。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-data">
          <h2 id="privacy-data">2. 取得・保存する情報</h2>
          <p>ログインおよび機能利用に伴い、次の情報を取り扱うことがあります。</p>
          <ul style={LIST_STYLE}>
            <li>Google アカウントのユーザー ID、メールアドレス、表示名、プロフィール画像</li>
            <li>Tier 表、視聴ステータス、ウォッチリスト（マイリスト）</li>
            <li>サブスクリプション（配信サービス）設定</li>
            <li>共有（share）、コメント、リアクション</li>
            <li>通知関連の設定・購読情報</li>
          </ul>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-feedback">
          <h2 id="privacy-feedback">3. 匿名フィードバックについて</h2>
          <p>
            「利用者の声」（
            <Link href="/feedback">/feedback</Link>
            ）はログイン不要の匿名送信を想定しています。氏名やメールの入力は求めませんが、本文や添付画像に個人情報や秘密情報を書かないでください。公開可能な Issue として扱われる可能性があります。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-share">
          <h2 id="privacy-share">4. 公開共有について</h2>
          <p>
            共有 URL を作成した場合、共有先に応じた Tier / ウォッチリスト / ダッシュボード等の内容が、リンクを知っている第三者から閲覧できることがあります。公開範囲に注意して共有してください。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-third">
          <h2 id="privacy-third">5. 第三者サービスとの関係</h2>
          <p>
            作品情報・配信情報等の取得のため、AniList、MyAnimeList、Jikan、TMDb、Google 等の外部サービスを利用することがあります。本サービスはこれらの公式サービスではなく、提携・後援・認定を受けていません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-retention">
          <h2 id="privacy-retention">6. 保持・バックアップ期間（暫定）</h2>
          <p>
            データの保持期間およびバックアップの保持期間は運用確認中です。専門家確認前の暫定方針であり、確定した期間を現時点ではお約束できません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-delete">
          <h2 id="privacy-delete">7. 削除機能について</h2>
          <p>
            設定画面にはアカウントデータの削除機能があります。ただし、バックアップや障害復旧用の複製、ログ、キャッシュ、外部連携側に残る情報まで含めた完全削除を保証するものではありません。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-export">
          <h2 id="privacy-export">8. データエクスポート</h2>
          <p>
            ログイン後の
            <Link href="/settings">設定</Link>
            画面から、アプリ内に保存した本人データのJSONエクスポートを実行できます。通知の暗号鍵や端末の認証情報などの秘密値はエクスポートに含まれません。手続きや不具合の相談は
            <Link href="/contact">お問い合わせ</Link>
            （公式窓口: <Link href="/feedback">/feedback</Link>
            ）からご連絡ください。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="privacy-contact">
          <h2 id="privacy-contact">9. お問い合わせ</h2>
          <p>
            プライバシーに関する問い合わせの公式窓口は
            <Link href="/feedback">利用者の声（/feedback）</Link>
            です。詳細な案内は
            <Link href="/contact">お問い合わせページ</Link>
            を参照してください。
          </p>
        </section>
      </article>
    </div>
  );
}
