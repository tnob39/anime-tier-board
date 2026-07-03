import type { Metadata } from "next";
import { MyPageClient } from "./mypage-client";

export const metadata: Metadata = {
  title: "マイページ | numanie"
};

export default function MyPage() {
  return <MyPageClient />;
}
