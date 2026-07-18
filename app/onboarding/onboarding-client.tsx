"use client";

import { useRouter } from "next/navigation";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";

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

    router.replace("/");
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

    router.replace("/");
  }

  return (
    <main className="app-main onboarding-main">
      <section className="onboarding-panel">
        <p className="eyebrow">はじめに</p>
        <h1>今入ってるサブスクを教えてください</h1>
        <p className="onboarding-lead">あとから設定で変更できます。</p>
        <SubscriptionPicker
          initialServiceIds={initialServiceIds}
          onSave={saveSubscriptions}
          onSkip={skipOnboarding}
          showSkip
          submitLabel="保存して始める"
          skipLabel="スキップ"
        />
      </section>
    </main>
  );
}