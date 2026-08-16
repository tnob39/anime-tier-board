import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createShare } from "@/lib/shares";
import {
  MAX_SHARE_PAYLOAD_BYTES,
  utf8ByteLength,
  validateSharePayload
} from "@/lib/board-snapshot";

type SharePayload = {
  board?: unknown;
  items?: unknown;
};

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  // Measure UTF-8 bytes, not JS UTF-16 string length.
  if (utf8ByteLength(rawBody) > MAX_SHARE_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: "共有データが大きすぎます。作品数を減らして再度お試しください。" },
      { status: 413 }
    );
  }

  let payload: SharePayload;

  try {
    payload = JSON.parse(rawBody) as SharePayload;
  } catch {
    return NextResponse.json(
      { error: "JSONの形式が正しくありません。" },
      { status: 400 }
    );
  }

  const validated = validateSharePayload(payload.board, payload.items);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const shareId = await createShare(userId, validated.board, validated.items);

  return NextResponse.json({ shareId });
}
