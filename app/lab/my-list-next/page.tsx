import type { Metadata } from "next";
import { MyListNextLab } from "./my-list-next-client.tsx";

export const metadata: Metadata = {
  title: "マイリスト次手 Lab — numanie",
  description: "未消化・長期放置・配信終了間近の次手を検証する独立モック",
  robots: { index: false }
};

export default function MyListNextLabPage() {
  return <MyListNextLab />;
}
