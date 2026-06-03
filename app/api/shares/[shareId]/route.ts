import { NextResponse } from "next/server";
import { getShare } from "@/lib/shares";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const share = await getShare(shareId);

  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  return NextResponse.json({ share });
}
