import { notFound } from "next/navigation";
import { getShare } from "@/lib/shares";
import { SharePageClient } from "./share-page-client";

export default async function SharePage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getShare(shareId);

  if (!share) {
    notFound();
  }

  return <SharePageClient initialShare={share} />;
}
