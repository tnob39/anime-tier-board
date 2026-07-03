import type { Metadata } from "next";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { MyPageClient } from "./mypage-client";

export const metadata: Metadata = {
  title: "マイページ | numanie"
};

export default async function MyPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  let statusCounts = null;

  if (userId) {
    const items = await listStatuses(userId);
    statusCounts = {
      planned: items.filter((item) => item.status === "planned").length,
      watching: items.filter((item) => item.status === "watching").length,
      completed: items.filter((item) => item.status === "completed").length,
      paused: items.filter((item) => item.status === "paused").length,
      dropped: items.filter((item) => item.status === "dropped").length,
    };
  }

  return <MyPageClient statusCounts={statusCounts} />;
}
