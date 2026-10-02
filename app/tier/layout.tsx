import { TierAreaNav } from "@/components/TierAreaNav";

export default function TierLayout({ children }: { children: React.ReactNode }) {
  return <><TierAreaNav />{children}</>;
}
