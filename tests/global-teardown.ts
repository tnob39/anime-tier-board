import { createClient } from "@libsql/client";
import * as path from "path";
import * as dotenv from "dotenv";
import { TEST_USER_ID } from "./global-setup";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function globalTeardown() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) return;

  const db = createClient({ url: tursoUrl, authToken: tursoToken });

  await Promise.all([
    db.execute({ sql: "DELETE FROM user_anime_statuses WHERE user_id = ?", args: [TEST_USER_ID] }),
    db.execute({ sql: "DELETE FROM user_subscriptions WHERE user_id = ?", args: [TEST_USER_ID] }),
    db.execute({ sql: "DELETE FROM user_preferences WHERE user_id = ?", args: [TEST_USER_ID] }),
  ]);
}

export default globalTeardown;
