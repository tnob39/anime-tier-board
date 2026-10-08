"use client";

import { ChevronDown, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";
import type { PublicSubscriptionDiagnosis } from "@/lib/subscription-stats";

export function SubscriptionsClient({
  diagnosis,
  initialSubscriptionServiceIds
}: {
  diagnosis: PublicSubscriptionDiagnosis;
  initialSubscriptionServiceIds: string[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasSubscriptions = initialSubscriptionServiceIds.length > 0;

  async function saveSubscriptions(serviceIds: string[]) {
    setMessage(null);
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceIds })
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "保存に失敗しました。");
    }
    setMessage("サブスク設定を保存しました。結果を更新しています…");
    router.refresh();
  }

  return (
    <main className="app-main subscriptions-main">
      <header className="subscriptions-hero">
        <p className="eyebrow">サブスク診断</p>
        <SubscriptionResult diagnosis={diagnosis} hasSubscriptions={hasSubscriptions} />
        <div className="subscriptions-hero-actions">
          <button className="command-button emphasis-button" type="button" onClick={() => setPickerOpen(true)}>
            {hasSubscriptions ? "加入サービスを編集" : "加入サービスを登録"}
          </button>
          {diagnosis.watchlistCount === 0 ? (
            <Link className="command-button" href="/explore">作品をさがす</Link>
          ) : null}
        </div>
        {message ? <p className="notice success" role="status" aria-live="polite">{message}</p> : null}
      </header>

      {hasSubscriptions && diagnosis.confirmedCount > 0 ? (
        <section className="subscriptions-breakdown" aria-labelledby="provider-breakdown-title">
          <div className="subscriptions-section-heading">
            <div>
              <p className="eyebrow">サービス別</p>
              <h2 id="provider-breakdown-title">確認済み作品の内訳</h2>
            </div>
            <span>{diagnosis.confirmedCount}本を集計</span>
          </div>
          <div className="subscription-diagnosis-list">
            {diagnosis.subscribedCoverage.map((entry) => {
              const exclusive = diagnosis.exclusiveByService.find((item) => item.serviceId === entry.serviceId);
              return (
                <details className="subscription-provider-row" key={entry.serviceId}>
                  <summary aria-label={`${entry.serviceName}の対象作品を表示`}>
                    <span className="subscription-provider-name">
                      <img src={entry.logoUrl} alt="" aria-hidden="true" loading="lazy" />
                      <strong>{entry.serviceName}</strong>
                    </span>
                    <span className="subscription-provider-count">{entry.count}本・{entry.percentage}%</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <div className="subscription-provider-detail">
                    {exclusive?.exclusiveAnime.length ? (
                      <p>登録中サービス内ではこのサービスのみ：{exclusive.exclusiveAnime.length}本</p>
                    ) : null}
                    <p>{entry.coveredAnime.length ? entry.coveredAnime.map((anime) => anime.title).join("、") : "対象作品はありません。"}</p>
                  </div>
                </details>
              );
            })}
          </div>
          {diagnosis.additionalByService[0]?.additionalCount ? (
            <p className="subscription-additional-hint">
              <strong>{diagnosis.additionalByService[0].serviceName}</strong>を追加すると、確認済み作品をさらに
              {diagnosis.additionalByService[0].additionalCount}本カバーできます。
            </p>
          ) : null}
        </section>
      ) : null}

      {diagnosis.unknownCount > 0 ? (
        <section className="subscriptions-unknown" aria-labelledby="unknown-title">
          <Info size={20} aria-hidden="true" />
          <div>
            <h2 id="unknown-title">配信先を確認できていない作品：{diagnosis.unknownCount}本</h2>
            <p>この作品はカバー率の分母にも「利用できない作品」にも含めていません。配信情報が確認でき次第、結果へ反映します。</p>
          </div>
        </section>
      ) : null}

      <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title="加入サービス" description="登録中の見放題サービスを選んでください。">
        <SubscriptionPicker initialServiceIds={initialSubscriptionServiceIds} onSave={saveSubscriptions} autoSave />
      </BottomSheet>
    </main>
  );
}

function SubscriptionResult({ diagnosis, hasSubscriptions }: { diagnosis: PublicSubscriptionDiagnosis; hasSubscriptions: boolean }) {
  if (!hasSubscriptions) {
    return <><h1>加入サービスを登録して診断</h1><p>登録中のサービスと、マイリストの配信先確認済み作品を照合します。</p></>;
  }
  if (diagnosis.watchlistCount === 0) {
    return <><h1>診断する作品がありません</h1><p>マイリストに作品を追加すると、見放題のカバー率を確認できます。</p></>;
  }
  if (diagnosis.confirmedCount === 0) {
    return <><h1>配信先を確認中です</h1><p>{diagnosis.watchlistCount}本すべての配信先が未確認です。未知の作品を未カバーとは数えません。</p></>;
  }
  return (
    <>
      <h1><strong>{diagnosis.coveragePercentage}%</strong> をカバー</h1>
      <p>配信先確認済み {diagnosis.confirmedCount}本中、加入中サービスで {diagnosis.coveredCount}本が見放題です。</p>
      {diagnosis.uncoveredAnime.length ? <p className="subscriptions-result-note">確認済み・未カバー {diagnosis.uncoveredAnime.length}本</p> : <p className="subscriptions-result-note">確認済み作品はすべてカバーしています。</p>}
    </>
  );
}
