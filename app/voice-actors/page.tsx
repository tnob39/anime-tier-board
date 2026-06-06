import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { VoiceActorsClient } from "./voice-actors-client";

export default async function VoiceActorsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const statuses = await listStatuses(userId);

  return <VoiceActorsClient statuses={statuses} />;
}
