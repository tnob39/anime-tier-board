export function RouteLoading({ label = "読み込み中…" }: { label?: string }) {
  return (
    <main className="app-main route-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="route-loading-skeleton" aria-hidden="true">
        {Array.from({ length: 2 }, (_, sectionIndex) => (
          <div key={sectionIndex} className="route-loading-skeleton-section">
            <div className="route-loading-skeleton-heading" />
            <div className="route-loading-skeleton-row">
              {Array.from({ length: 6 }, (_, cardIndex) => (
                <div key={cardIndex} className="skeleton-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
