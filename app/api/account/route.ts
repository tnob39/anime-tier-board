import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteUserAccountData
} from "@/lib/account-deletion";
import {
  ACCOUNT_EXPORT_FILENAME,
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  exportUserAccountData
} from "@/lib/account-export";
import { AppError } from "@/lib/errors/app-error";

type AccountDeleteBody = {
  confirmation?: unknown;
};

export const GET = withApiRoute("account.GET", async (_request: Request) => {
  // userId comes only from requireUserId (session/native bearer).
  // Query/body userId must never select another user — ignore client-supplied ids.
  const userId = await requireUserId();
  const payload = await exportUserAccountData(userId);

  // schemaVersion is fixed by the export helper; keep the constant referenced for contracts.
  if (payload.schemaVersion !== ACCOUNT_EXPORT_SCHEMA_VERSION) {
    throw new AppError({
      message: "エクスポート形式の準備に失敗しました。",
      status: 500,
      code: "INTERNAL",
      expose: true
    });
  }

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ACCOUNT_EXPORT_FILENAME}"`,
      "Cache-Control": "no-store"
    }
  });
});

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
