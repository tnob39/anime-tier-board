import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listEvangelistCardsByUser,
  toEvangelistCardResponse
} from "@/lib/evangelist-cards";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cards = await listEvangelistCardsByUser(userId);

  return NextResponse.json({
    items: cards.map(toEvangelistCardResponse)
  });
}