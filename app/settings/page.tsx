import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Metadata } from "next";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "設定 — numanie"
};

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required&returnTo=%2Fsettings");
  }

  return <SettingsClient />;
}
