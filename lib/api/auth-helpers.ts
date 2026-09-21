import { headers } from "next/headers";

import { auth } from "@/auth";
import { getUserIdFromAuthorizationHeader } from "@/lib/api/native-auth";
import {
  readBearerUserIdForWrite,
  resolveWriteIdentityFromLookups,
  type WriteAuthIdentity,
} from "@/lib/api/write-admission";
import { AppError } from "@/lib/errors/app-error";

function unauthorized(): AppError {
  return new AppError({
    message: "ログインが必要です。",
    status: 401,
    code: "UNAUTHORIZED",
    expose: true,
  });
}

/**
 * 有効 Bearer → native identity（auth() は呼ばない）。
 * 狭く証明できる malformed/expired Bearer のみ auth() をちょうど 1 回。
 * 復号鍵不一致・設定・JOSE 親クラスは伝播し auth() は呼ばない。
 */
export async function requireWriteIdentity(): Promise<WriteAuthIdentity> {
  const headerList = await headers();
  const authorization = headerList.get("authorization");
  const identity = await resolveWriteIdentityFromLookups({
    getBearerUserId: () =>
      readBearerUserIdForWrite(() =>
        getUserIdFromAuthorizationHeader(authorization)
      ),
    getSessionUserId: async () => {
      const session = await auth();
      return (session?.user as { id?: string } | undefined)?.id ?? null;
    },
  });
  if (!identity) {
    throw unauthorized();
  }
  return identity;
}

export async function requireUserId(): Promise<string> {
  return (await requireWriteIdentity()).userId;
}

export type { WriteAuthIdentity };
