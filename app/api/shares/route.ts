import { createShareHandlers } from "@/lib/api/impression-share-handlers";
import { consumeWriteRateLimit } from "@/lib/api/write-admission";
import { assertSameOriginBrowserWrite, readJsonWithByteLimit } from "@/lib/api/write-request-guard";

const handlers = createShareHandlers({
  assertSameOrigin: assertSameOriginBrowserWrite,
  rateLimit: consumeWriteRateLimit,
  readJson: readJsonWithByteLimit
});
export const POST = handlers.POST;
export const GET = handlers.LIST;
