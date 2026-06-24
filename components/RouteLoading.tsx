import { Loader2 } from "lucide-react";

export function RouteLoading({ label = "読み込み中…" }: { label?: string }) {
  return (
    <main className="app-main route-loading" aria-busy="true" aria-live="polite">
      <Loader2 className="spin" size={28} />
      <p>{label}</p>
    </main>
  );
}
