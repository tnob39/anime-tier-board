import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import type { Metadata } from "next";
import { VoiceActorsClient } from "./voice-actors-client";

export const metadata: Metadata = {
  title: "声優 — numanie"
};

export default async function VoiceActorsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required&returnTo=/voice-actors");
  }

  const statuses = await listStatuses(userId);

  return <VoiceActorsClient statuses={statuses} />;
}
