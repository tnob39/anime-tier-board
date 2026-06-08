export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION"
  | "UPSTREAM"
  | "DATABASE"
  | "INTERNAL";

export type ApiErrorBody = {
  error: string;
  code?: ErrorCode;
  requestId?: string;
};