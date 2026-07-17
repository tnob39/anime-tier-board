export default function NotFound() {
  return (
    <main className="page-shell" style={{ padding: "2rem 1rem", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        ページが見つかりませんでした
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
        URLが変更されたか、削除された可能性があります。トップに戻ってお試しください。
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a href="/" className="command-button emphasis-button">
          トップへ
        </a>
      </div>
    </main>
  );
}
