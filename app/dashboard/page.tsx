import { redirect } from "next/navigation";
import { auth } from "@/auth";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "サブスク診断 — numanie"
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required&returnTo=%2Fsubscriptions");
  }
  redirect("/subscriptions");
}
