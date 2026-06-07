import { getTursoClient } from "@/lib/turso";
import { isValidServiceId } from "@/lib/streaming-services";

export type UserSubscription = {
  serviceId: string;
  createdAt: string;
};

export type SubscriptionState = {
  subscriptions: UserSubscription[];
  onboardingDone: boolean;
};

let subscriptionSchemaReady: Promise<void> | null = null;

export async function getSubscriptionState(userId: string): Promise<SubscriptionState> {
  await ensureSubscriptionSchema();

  const [subscriptionsResult, preferencesResult] = await Promise.all([
    getTursoClient().execute({
      sql: `select service_id, created_at
            from user_subscriptions
            where user_id = ?
            order by created_at asc`,
      args: [userId]
    }),
    getTursoClient().execute({
      sql: "select onboarding_done from user_preferences where user_id = ?",
      args: [userId]
    })
  ]);

  const subscriptions = subscriptionsResult.rows
    .map((row) => {
      const serviceId = String(row.service_id);
      if (!isValidServiceId(serviceId)) {
        return null;
      }

      return {
        serviceId,
        createdAt: String(row.created_at)
      };
    })
    .filter((record): record is UserSubscription => Boolean(record));

  const onboardingDone = Number(preferencesResult.rows[0]?.onboarding_done ?? 0) === 1;

  return { subscriptions, onboardingDone };
}

export async function replaceSubscriptions({
  userId,
  serviceIds,
  markOnboardingDone = false
}: {
  userId: string;
  serviceIds: string[];
  markOnboardingDone?: boolean;
}) {
  await ensureSubscriptionSchema();

  const uniqueServiceIds = [...new Set(serviceIds)].filter(isValidServiceId);
  const client = getTursoClient();
  const now = new Date().toISOString();

  await client.execute({
    sql: "delete from user_subscriptions where user_id = ?",
    args: [userId]
  });

  for (const serviceId of uniqueServiceIds) {
    await client.execute({
      sql: `insert into user_subscriptions (user_id, service_id, created_at)
            values (?, ?, ?)`,
      args: [userId, serviceId, now]
    });
  }

  if (markOnboardingDone) {
    await client.execute({
      sql: `insert into user_preferences (user_id, onboarding_done, updated_at)
            values (?, 1, ?)
            on conflict(user_id)
            do update set onboarding_done = 1,
                          updated_at = excluded.updated_at`,
      args: [userId, now]
    });
  }
}

export async function markOnboardingDone(userId: string) {
  await ensureSubscriptionSchema();

  const now = new Date().toISOString();
  await getTursoClient().execute({
    sql: `insert into user_preferences (user_id, onboarding_done, updated_at)
          values (?, 1, ?)
          on conflict(user_id)
          do update set onboarding_done = 1,
                        updated_at = excluded.updated_at`,
    args: [userId, now]
  });
}

export function ensureSubscriptionSchema() {
  subscriptionSchemaReady ??= (async () => {
    const client = getTursoClient();

    await client.execute(`create table if not exists user_subscriptions (
      user_id text not null,
      service_id text not null,
      created_at text not null default (datetime('now')),
      primary key (user_id, service_id)
    )`);

    await client.execute(`create table if not exists user_preferences (
      user_id text primary key,
      onboarding_done integer not null default 0,
      updated_at text not null default (datetime('now'))
    )`);
  })();

  return subscriptionSchemaReady;
}