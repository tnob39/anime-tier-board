import { NextResponse } from "next/server";
import {
  getEvangelistCard,
  toEvangelistCardResponse
} from "@/lib/evangelist-cards";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await context.params;
  const card = await getEvangelistCard(cardId, { incrementView: true });

  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(toEvangelistCardResponse(card));
}