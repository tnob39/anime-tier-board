import Link from "next/link";
import type { JSX } from "react";

export function ShareCardCTA({
  headline,
  buttonLabel,
  href
}: {
  headline: string;
  buttonLabel: string;
  href: string;
}): JSX.Element {
  return (
    <section className="share-card-cta">
      <p>{headline}</p>
      <Link href={href} className="command-button emphasis-button">
        {buttonLabel}
      </Link>
    </section>
  );
}
