import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addComment, listComments } from "@/lib/shares";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  return NextResponse.json({ comments: await listComments(shareId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const user = session?.user;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shareId } = await params;
  let payload: { body?: string };
  try {
    payload = (await request.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body = payload.body?.trim();

  if (!body || body.length > 1000) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  try {
    const comment = await addComment({
      shareId,
      userId,
      userName: user?.name,
      userImage: user?.image,
      body
    });

    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comment failed";
    const status = message === "Share not found." ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
