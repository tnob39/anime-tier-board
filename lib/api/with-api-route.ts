import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/errors/to-response";

type RouteHandler = (request: Request) => Promise<NextResponse>;

export function withApiRoute(routeName: string, handler: RouteHandler): RouteHandler {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      return toErrorResponse(error, { route: routeName });
    }
  };
}