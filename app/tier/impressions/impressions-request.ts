export async function impressionRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  let body: { error?: string } & T;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
    body = await response.json();
  } catch {
    throw new Error("通信に失敗しました。入力を保持しています。再試行してください。");
  }
  if (!response.ok) {
    const error = new Error(typeof body.error === "string" ? body.error : "処理に失敗しました。再試行してください。");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body;
}

export function impressionError(error: unknown): string {
  return error instanceof Error ? error.message : "処理に失敗しました。再試行してください。";
}
