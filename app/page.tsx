import { redirect } from "next/navigation";

// Stage 2 (#63) 実装前の暫定リダイレクト。
// 本ホーム（視聴中ホーム）が完成したら此処を置き換える。
export default function Home() {
  redirect("/tier");
}
