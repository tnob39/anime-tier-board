import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteUserAccountData
} from "@/lib/account-deletion";
import { AppError } from "@/lib/errors/app-error";

type AccountDeleteBody = {
  confirmation?: unknown;
};

export const DELETE = withApiRoute("account.DELETE", async (request: Request) => {
  const userId = await requireUserId();

  let payload: AccountDeleteBody;
  try {
    payload = (await request.json()) as AccountDeleteBody;
  } catch {
    throw new AppError({
      message: "リクエストの形式が正しくありません。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  if (
    payload == null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof payload.confirmation !== "string" ||
    payload.confirmation !== ACCOUNT_DELETION_CONFIRMATION
  ) {
    throw new AppError({
      message: "確認のため「削除する」と正確に入力してください。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  // userId comes only from requireUserId (session/native bearer). Ignore any client-supplied id.
  await deleteUserAccountData(userId);

  return NextResponse.json({ ok: true });
});
