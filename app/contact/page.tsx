import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "お問い合わせ — numanie",
  description:
    "numanie（個人開発プロジェクト）へのお問い合わせ案内。公式窓口は /feedback です。",
};

const SECTION_STYLE: CSSProperties = {
  marginTop: 20,
};

const LIST_STYLE: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 20,
  lineHeight: 1.7,
};

export default function ContactPage() {
  return (
    <div className="feedback-main">
      <header className="feedback-header">
        <Link href="/" className="feedback-back">
          ← ホームへ
        </Link>
        <h1>お問い合わせ</h1>
        <p>
          運営主体: numanie（個人開発プロジェクト） / 案内更新日: 2026-08-23
        </p>
      </header>

      <div className="feedback-notice" role="note">
        <p>
          公式の問い合わせ窓口は既存の
          <Link href="/feedback">利用者の声（/feedback）</Link>
          のみです。電話番号・郵便住所・個別メールアドレス等は案内しません。回答期限（SLA）は保証しません。
        </p>
      </div>

      <article className="feedback-panel">
        <section style={SECTION_STYLE} aria-labelledby="contact-topics">
          <h2 id="contact-topics">1. 受け付ける内容</h2>
          <p>次のような内容を /feedback から送れます。</p>
          <ul style={LIST_STYLE}>
            <li>プライバシーに関する質問・指摘</li>
            <li>
              データエクスポートに関する要望・不具合報告（設定画面のエクスポート機能）
            </li>
            <li>データ削除に関する要望・不具合報告</li>
            <li>権利侵害に関する申告</li>
            <li>一般的な要望・改善アイデア・不具合報告</li>
          </ul>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="contact-channel">
          <h2 id="contact-channel">2. 公式窓口</h2>
          <p>
            お問い合わせは
            <Link href="/feedback">/feedback（利用者の声）</Link>
            から送信してください。関連ページ:
          </p>
          <ul style={LIST_STYLE}>
            <li>
              <Link href="/privacy">プライバシーポリシー</Link>
            </li>
            <li>
              <Link href="/terms">利用規約</Link>
            </li>
            <li>
              <Link href="/settings">設定（データのエクスポート・削除）</Link>
            </li>
          </ul>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="contact-secrets">
          <h2 id="contact-secrets">3. 秘密情報の送信禁止</h2>
          <p>
            パスワード、認証コード、API
            キー、決済情報、他人の個人情報、その他の秘密情報は送信しないでください。フィードバックは匿名送信を想定していますが、本文や画像に書いた内容が公開可能な Issue
            として扱われる可能性があります。
          </p>
        </section>

        <section style={SECTION_STYLE} aria-labelledby="contact-sla">
          <h2 id="contact-sla">4. 回答について</h2>
          <p>
            個人開発のため、返信の有無・時期・完全な対応を保証しません（SLA
            保証なし）。重要な権利侵害申告などは、わかる範囲で優先して確認しますが、即時対応はお約束できません。
          </p>
        </section>
      </article>
    </div>
  );
}
