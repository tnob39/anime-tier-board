"use client";

import Link from "next/link";
import { useState } from "react";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";
import { useUiMode, type UiMode } from "@/lib/ui-mode";

const uiModeOptions: Array<{ value: UiMode; label: string; description: string }> = [
  {
    value: "simple",
    label: "シンプル",
    description: "今期アニメの確認と視聴管理だけ。初めての方や、ティア表機能を使わない方向け。"
  },
  {
    value: "pro",
    label: "プロ",
    description: "ティア表のドラッグ操作、PNG出力、共有URL、過去作探索、声優、分析など全機能。"
  }
];

export function SettingsClient({ initialServiceIds }: { initialServiceIds: string[] }) {
  const [serviceIds, setServiceIds] = useState(initialServiceIds);
  const [message, setMessage] = useState<string | null>(null);
  const { mode, setMode } = useUiMode();

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
        <h2>表示モード</h2>
        <p>アプリの表示をシンプルにするかどうかを選べます。</p>
        <div className="ui-mode-options">
          {uiModeOptions.map((option) => (
            <label key={option.value} className={`ui-mode-option${mode === option.value ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="uiMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              <div className="ui-mode-option-body">
                <span className="ui-mode-option-label">{option.label}</span>
                <span className="ui-mode-option-desc">{option.description}</span>
              </div>
            </label>
          ))}
        </div>
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
        <Link className="command-button emphasis-button" href="/subscriptions">
          サブスク診断を見る
        </Link>
      </section>
    </main>
  );
}