"use client";

import Link from "next/link";
import { useState } from "react";
import { PushToggle } from "@/components/PushToggle";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";

export function SettingsClient({ initialServiceIds }: { initialServiceIds: string[] }) {
  const [serviceIds, setServiceIds] = useState(initialServiceIds);
  const [message, setMessage] = useState<string | null>(null);

  async function saveSubscriptions(nextServiceIds: string[]) {
    const previous = serviceIds;
    setServiceIds(nextServiceIds);
    setMessage(null);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ serviceIds: nextServiceIds })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "保存に失敗しました。");
      }

      setMessage("サブスク設定を保存しました。");
    } catch (error) {
      setServiceIds(previous);
      throw error;
    }
  }

  return (
    <main className="app-main settings-main">
      <header className="settings-header">
        <div>
          <p className="eyebrow">設定</p>
          <h1>アカウント設定</h1>
          <p>加入中のストリーミングサービスを管理します。</p>
        </div>
        <Link className="command-button" href="/dashboard">
          ダッシュボードへ
        </Link>
      </header>

      <section className="settings-panel">
        <h2>プッシュ通知</h2>
        <p>視聴中・見たいアニメの放送日に通知を受け取れます。</p>
        <PushToggle />
      </section>

      <section className="settings-panel">
        <h2>サブスク設定</h2>
        <p>チェックを変更するとすぐに保存されます。</p>
        {message ? <div className="notice success">{message}</div> : null}
        <SubscriptionPicker initialServiceIds={serviceIds} onSave={saveSubscriptions} />
      </section>

      <section className="settings-panel">
        <h2>サブスク診断</h2>
        <p>ウォッチリストと照合して、見放題カバー率を確認できます。</p>
        <Link className="command-button emphasis-button" href="/dashboard?section=subscriptions">
          サブスク診断を見る
        </Link>
      </section>
    </main>
  );
}