import type { CSSProperties } from "react";
import Link from "next/link";

const FOOTER_STYLE: CSSProperties = {
  marginTop: 24,
  // Keep links clear of the fixed mobile bottom nav without new CSS.
  padding: "16px clamp(16px, 3vw, 36px) calc(96px + env(safe-area-inset-bottom, 0px))",
  borderTop: "1px solid var(--line)",
  color: "var(--muted)",
  fontSize: 13,
  lineHeight: 1.6,
};

const NAV_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 16px",
  alignItems: "center",
  minHeight: 44,
};

const LINK_STYLE: CSSProperties = {
  color: "var(--ink)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
};

const META_STYLE: CSSProperties = {
  margin: "8px 0 0",
};

export function LegalFooter() {
  return (
    <footer role="contentinfo" aria-label="法務情報" style={FOOTER_STYLE}>
      <nav aria-label="プライバシー・利用規約・お問い合わせ" style={NAV_STYLE}>
        <Link href="/privacy" style={LINK_STYLE}>
          プライバシーポリシー
        </Link>
        <Link href="/terms" style={LINK_STYLE}>
          利用規約
        </Link>
        <Link href="/contact" style={LINK_STYLE}>
          お問い合わせ
        </Link>
      </nav>
      <p style={META_STYLE}>運営: numanie（個人開発プロジェクト）</p>
    </footer>
  );
}
