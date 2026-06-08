import { NextResponse } from "next/server";
import { AppError, isAppError } from "./app-error";
import { logApiError } from "./log";
import type { ApiErrorBody, ErrorCode } from "./types";

function newRequestId(): string {
  return crypto.randomUUID();
}

function isDatabaseError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("turso") ||
    msg.includes("libsql") ||
    msg.includes("sqlite") ||
    msg.includes("database")
  );
}

function mapUnknownError(error: unknown): {
  status: number;
  code: ErrorCode;
  message: string;
  expose: boolean;
} {
  if (isAppError(error)) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      expose: error.expose,
    };
  }

  if (error instanceof Error) {
    if (isDatabaseError(error)) {
      return {
        status: 503,
        code: "DATABASE",
        message: "データベースに接続できませんでした。しばらくしてから再度お試しください。",
        expose: true,
      };
    }

    return {
      status: 500,
      code: "INTERNAL",
      message: "サーバーでエラーが発生しました。",
      expose: false,
    };
  }

  return {
    status: 500,
    code: "INTERNAL",
    message: "サーバーでエラーが発生しました。",
    expose: false,
  };
}

export function toErrorResponse(
  error: unknown,
  options: { route: string; userId?: string }
): NextResponse<ApiErrorBody> {
  const requestId = newRequestId();
  const mapped = mapUnknownError(error);

  logApiError({
    route: options.route,
    requestId,
    code: mapped.code,
    userId: options.userId,
    cause: error,
  });

  const body: ApiErrorBody = {
    error:
      isAppError(error) && mapped.expose ? error.message : mapped.message,
    code: mapped.code,
    requestId,
  };

  return NextResponse.json(body, { status: mapped.status });
}

export function jsonValidationError(message: string): NextResponse<ApiErrorBody> {
  const requestId = newRequestId();
  return NextResponse.json(
    { error: message, code: "VALIDATION" as const, requestId },
    { status: 400 }
  );
}

export { AppError };