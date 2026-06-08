import type { ErrorCode } from "./types";

type LogPayload = {
  route: string;
  requestId: string;
  code: ErrorCode;
  userId?: string;
  cause?: unknown;
};

export function logApiError(payload: LogPayload): void {
  const cause =
    payload.cause instanceof Error
      ? { name: payload.cause.name, message: payload.cause.message }
      : payload.cause;

  console.error(
    JSON.stringify({
      type: "api_error",
      at: new Date().toISOString(),
      ...payload,
      cause,
    })
  );
}