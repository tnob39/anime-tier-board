import { createClient } from "@libsql/client";

let client: ReturnType<typeof createClient> | null = null;

export function getTursoClient() {
  if (client) {
    return client;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required.");
  }

  if (!authToken) {
    throw new Error("TURSO_AUTH_TOKEN is required.");
  }

  client = createClient({
    url,
    authToken
  });

  return client;
}
