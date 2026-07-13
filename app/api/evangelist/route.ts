import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createEvangelistCard,
  isValidComment
} from "@/lib/evangelist-cards";
import { listStatuses } from "@/lib/statuses";

type CreatePayload = {
  animeId?: string;
  comment?: string;
};

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let payload: CreatePayload;

  try {
    payload = (await request.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  if (!payload.animeId || !payload.comment || !isValidComment(payload.comment)) {
    return NextResponse.json({ error: "入力内容が不正です。" }, { status: 400 });
  }

  const watchlistItem = (await listStatuses(userId)).find(
    (item) => item.animeId === payload.animeId && item.anime
  );

  if (!watchlistItem?.anime) {
    return NextResponse.json(
      { error: "対象作品がマイリストに見つかりません。" },
      { status: 400 }
    );
  }

  try {
    const cardId = await createEvangelistCard({
      userId,
      animeId: payload.animeId,
      comment: payload.comment,
      anime: watchlistItem.anime,
      authorName: session?.user?.name ?? null,
      authorImage: session?.user?.image ?? null
    });

    return NextResponse.json({
      cardId,
      url: `/share/evangelist/${cardId}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "布教カードの作成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}