import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  WRITE_BODY_MAX_BYTES,
  consumeWriteRateLimit,
} from "@/lib/api/write-admission";
import {
  assertSameOriginBrowserWrite,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
import {
  createEvangelistCard,
  isValidComment,
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

  const originDenied = assertSameOriginBrowserWrite(request);
  if (originDenied) return originDenied;

  const limited = consumeWriteRateLimit(request, {
    userId,
    policy: "shareCreate",
  });
  if (limited) return limited;

  const parsed = await readJsonWithByteLimit<CreatePayload>(
    request,
    WRITE_BODY_MAX_BYTES.evangelist
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

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
      authorImage: session?.user?.image ?? null,
    });

    return NextResponse.json({
      cardId,
      url: `/share/evangelist/${cardId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "布教カードの作成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
