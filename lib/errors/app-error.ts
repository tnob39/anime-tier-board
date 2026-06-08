import type { ErrorCode } from "./types";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly expose: boolean;

  constructor(options: {
    message: string;
    status: number;
    code: ErrorCode;
    expose?: boolean;
  }) {
    super(options.message);
    this.name = "AppError";
    this.status = options.status;
    this.code = options.code;
    this.expose = options.expose ?? false;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}