import { auth } from "@/auth";
import { AppError } from "@/lib/errors/app-error";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    throw new AppError({
      message: "ログインが必要です。",
      status: 401,
      code: "UNAUTHORIZED",
      expose: true,
    });
  }

  return userId;
}