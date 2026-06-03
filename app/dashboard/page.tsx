import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDashboard } from "@/lib/statuses";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const dashboard = await getDashboard(userId);

  return <DashboardClient dashboard={dashboard} />;
}
