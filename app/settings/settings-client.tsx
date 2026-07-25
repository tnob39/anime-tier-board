"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { PushToggle } from "@/components/PushToggle";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";
import { readNavV5, setNavV5 } from "@/lib/nav-flag";

export function SettingsClient({ initialServiceIds }: { initialServiceIds: string[] }) {
  const { data: session } = useSession();
  const [serviceIds, setServiceIds] = useState(initialServiceIds);
  const [message, setMessage] = useState<string | null>(null);
  const [navV5, setNavV5State] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setNavV5State(readNavV5());
  }, []);

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

  function openDeleteConfirm() {
    setShowDeleteConfirm(true);
    setDeleteInput("");
    setDeleteError(null);
  }

  function cancelDeleteConfirm() {
    setShowDeleteConfirm(false);
    setDeleteInput("");
    setDeleteError(null);
  }

  async function executeAccountDataDeletion() {
    if (deletePending) {
      return;
    }
    if (deleteInput !== ACCOUNT_DELETION_CONFIRMATION) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmation: deleteInput })
      });

      if (!response.ok) {
        let messageText = "アカウントデータの削除に失敗しました。";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            messageText = payload.error;
          }
        } catch {
          // keep default message
        }
        setDeleteError(messageText);
        setDeletePending(false);
        return;
      }

      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteError("アカウントデータの削除に失敗しました。通信環境を確認して再度お試しください。");
      setDeletePending(false);
    }
  }

  const canSubmitDeletion =
    !deletePending && deleteInput === ACCOUNT_DELETION_CONFIRMATION;

  return (
    <main className="app-main settings-main">
      <header className="settings-header">
        <div>
          <p className="eyebrow">設定</p>
          <h1>設定</h1>
          <p>加入中のストリーミングサービスを管理します。</p>
        </div>
        <Link className="command-button" href="/dashboard">
          分析へ
        </Link>
      </header>

      <section className="settings-panel">
        <h2>アカウント</h2>
        <p title={session?.user?.name ?? session?.user?.email ?? undefined}>
          {session?.user?.name ?? session?.user?.email ?? "ログイン中"}
        </p>
        <button type="button" className="command-button" onClick={() => void signOut()}>
          <LogOut size={15} aria-hidden="true" />
          <span>ログアウト</span>
        </button>
      </section>

      <section className="settings-panel" aria-labelledby="account-data-deletion-heading">
        <h2 id="account-data-deletion-heading">アカウントデータの削除</h2>
        {!showDeleteConfirm ? (
          <>
            <p>
              このアプリに保存した視聴ステータス・ボード・共有・通知設定などのデータを削除できます。Googleアカウント自体は削除されません。
            </p>
            <button type="button" className="command-button" onClick={openDeleteConfirm}>
              アカウントデータを削除する
            </button>
          </>
        ) : (
          <>
            <p>
              この操作は取り消せません。アプリ内のデータは完全に削除されます。Googleアカウントは削除されません。
            </p>
            <p>
              確認のため、下の入力欄に「{ACCOUNT_DELETION_CONFIRMATION}」と正確に入力してください。
            </p>
            <label className="settings-nav-toggle" htmlFor="account-deletion-confirmation">
              <span>確認入力</span>
              <input
                id="account-deletion-confirmation"
                type="text"
                autoComplete="off"
                value={deleteInput}
                disabled={deletePending}
                onChange={(event) => {
                  setDeleteInput(event.target.value);
                  if (deleteError) {
                    setDeleteError(null);
                  }
                }}
                placeholder={ACCOUNT_DELETION_CONFIRMATION}
              />
            </label>
            {deleteError ? (
              <div className="notice" role="alert" aria-live="assertive">
                {deleteError}
              </div>
            ) : null}
            <div className="settings-deletion-actions">
              <button
                type="button"
                className="command-button"
                disabled={deletePending}
                onClick={cancelDeleteConfirm}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="command-button"
                disabled={!canSubmitDeletion}
                onClick={() => void executeAccountDataDeletion()}
              >
                {deletePending ? "削除中..." : "削除を実行する"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="settings-panel">
        <h2>ベータ機能</h2>
        <p>新しいナビゲーションを端末ごとに切り替えられます。</p>
        <label className="settings-nav-toggle">
          <span>新しいナビ（5タブ＋マイページ）を試す（ベータ）</span>
          <input
            type="checkbox"
            checked={navV5}
            onChange={(event) => {
              const checked = event.target.checked;
              setNavV5State(checked);
              setNavV5(checked);
            }}
          />
        </label>
      </section>

      <section className="settings-panel">
        <h2>プッシュ通知</h2>
        <p>視聴中・見たいアニメの放送日に通知を受け取れます。</p>
        <PushToggle />
      </section>

      <section className="settings-panel">
        <h2>サブスク設定</h2>
        <p>チェックを変更するとすぐに保存されます。</p>
        {message ? (
          <div className="notice success" role="status" aria-live="polite">
            {message}
          </div>
        ) : null}
        <SubscriptionPicker
          initialServiceIds={serviceIds}
          onSave={saveSubscriptions}
          autoSave
        />
      </section>

      <section className="settings-panel">
        <h2>サブスク診断</h2>
        <p>マイリストと照合して、見放題カバー率を確認できます。</p>
        <Link className="command-button emphasis-button" href="/dashboard?section=subscriptions">
          サブスク診断を見る
        </Link>
      </section>
    </main>
  );
}
