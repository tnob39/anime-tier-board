export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION"
  | "CONFLICT"
  | "UPSTREAM"
  | "DATABASE"
  | "INTERNAL";

export type ApiErrorBody = {
  error: string;
  code?: ErrorCode;
  requestId?: string;
};