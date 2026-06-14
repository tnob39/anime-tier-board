import { headers } from "next/headers";

import { auth } from "@/auth";
import { getUserIdFromAuthorizationHeader } from "@/lib/api/native-auth";
import { AppError } from "@/lib/errors/app-error";

export async function requireUserId(): Promise<string> {
  const headerList = await headers();
  const bearerUserId = await getUserIdFromAuthorizationHeader(headerList.get("authorization"));
  if (bearerUserId) {
    return bearerUserId;
  }

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