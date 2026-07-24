"use client";

import { useRouter } from "next/navigation";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";

const FIRST_ANIME_TARGET = "/#home-add-section";

export function OnboardingClient({ initialServiceIds }: { initialServiceIds: string[] }) {
  const router = useRouter();

  async function saveSubscriptions(serviceIds: string[]) {
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serviceIds,
        onboardingComplete: true
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "保存に失敗しました。");
    }

    router.replace(FIRST_ANIME_TARGET);
  }

  async function skipOnboarding() {
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serviceIds: [],
        onboardingComplete: true
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "処理に失敗しました。");
    }

    router.replace(FIRST_ANIME_TARGET);
  }

  return (
    <main className="app-main onboarding-main">
      <section className="onboarding-panel">
        <p className="eyebrow">はじめに</p>
        <h1>見放題チェックを設定して、気になる1本を選びましょう</h1>
        <p className="onboarding-lead">
          サブスクを選ぶと、作品カードで「見放題かどうか」を判定できます。課金や外部連携は行いません。
        </p>
        <p className="onboarding-lead">
          保存またはスキップ後、今期の作品から「見たい」「視聴中」に追加する画面へ移動します。
        </p>
        <SubscriptionPicker
          initialServiceIds={initialServiceIds}
          onSave={saveSubscriptions}
          onSkip={skipOnboarding}
          showSkip
          submitLabel="保存して作品を選ぶ"
          skipLabel="スキップして作品を選ぶ"
        />
      </section>
    </main>
  );
}