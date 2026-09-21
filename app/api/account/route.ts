import { NextResponse } from "next/server";
import { requireUserId, requireWriteIdentity } from "@/lib/api/auth-helpers";
import {
  WRITE_BODY_MAX_BYTES,
  admitCookieCapableWrite,
} from "@/lib/api/write-admission";
import { readJsonWithByteLimit } from "@/lib/api/write-request-guard";
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
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<AccountDeleteBody>(
    request,
    WRITE_BODY_MAX_BYTES.account
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

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
