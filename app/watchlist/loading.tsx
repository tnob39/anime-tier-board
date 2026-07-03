import "./watchlist-v2-grok.css";

export default function Loading() {
  return (
    <main
      className="wl2g-root wl2g-skel-root"
      aria-busy="true"
      aria-label="マイリストを読み込み中"
    >
      <div aria-hidden="true">
        <header className="wl2g-header">
          <div className="wl2g-skel wl2g-skel--title" />
          <div className="wl2g-skel wl2g-skel--search" />
          <div className="wl2g-skel-filters">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="wl2g-skel wl2g-skel--chip" />
            ))}
          </div>
        </header>

        {Array.from({ length: 2 }, (_, sectionIndex) => (
          <section key={sectionIndex}>
            <div className="wl2g-sec">
              <div className="wl2g-skel wl2g-skel--heading" />
            </div>
            <div className="wl2g-skel-lane">
              {Array.from({ length: 6 }, (_, posterIndex) => (
                <div key={posterIndex} className="wl2g-skel wl2g-skel--poster" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
