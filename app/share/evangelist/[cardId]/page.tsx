import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  getEvangelistCard,
  toEvangelistCardResponse
} from "@/lib/evangelist-cards";
import { getSiteOrigin } from "@/lib/site-url";
import { EvangelistShareClient } from "./evangelist-share-client";

export async function generateMetadata({
  params
}: {
  params: Promise<{ cardId: string }>;
}): Promise<Metadata> {
  const { cardId } = await params;
  const card = await getEvangelistCard(cardId);

  if (!card) {
    return {
      title: "布教カードが見つかりません"
    };
  }

  const authorLabel = card.authorName ?? "ユーザー";
  const title = `${authorLabel}のおすすめ：${card.animeTitle}`;
  const description = card.comment;
  const imageUrl = card.animeImageUrl ?? undefined;
  const pageUrl = `${getSiteOrigin()}/share/evangelist/${cardId}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
      url: pageUrl,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined
    }
  };
}

export default async function EvangelistSharePage({
  params
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await getEvangelistCard(cardId, { incrementView: true });

  if (!card) {
    notFound();
  }

  const session = await auth();
  const isAuthenticated = Boolean(session?.user);

  return (
    <EvangelistShareClient
      initialCard={toEvangelistCardResponse(card)}
      isAuthenticated={isAuthenticated}
    />
  );
}