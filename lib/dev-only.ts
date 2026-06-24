import { NextResponse } from "next/server";

export function isDevOnlyEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** デバッグ専用APIルートの先頭で呼ぶ。本番では404を返す。 */
export function devOnlyRouteGuard(): NextResponse | null {
  if (isDevOnlyEnvironment()) {
    return null;
  }

  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
