"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { PushToggle } from "@/components/PushToggle";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";
import { readNavV5, setNavV5 } from "@/lib/nav-flag";

/** Must match lib/account-export ACCOUNT_EXPORT_FILENAME (avoid importing server lib here). */
const ACCOUNT_EXPORT_DOWNLOAD_NAME = "numanie-account-export.json";

type ExportUiState = "idle" | "pending" | "success" | "failure";
type DeleteUiState = "idle" | "pending" | "success" | "failure" | "signOutFailure";

export function SettingsClient({ initialServiceIds }: { initialServiceIds: string[] }) {
  const { data: session } = useSession();
  const [serviceIds, setServiceIds] = useState(initialServiceIds);
  const [message, setMessage] = useState<string | null>(null);
  const [navV5, setNavV5State] = useState(false);

  const [exportState, setExportState] = useState<ExportUiState>("idle");
  const [exportLiveMessage, setExportLiveMessage] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteUiState>("idle");
  const [deleteLiveMessage, setDeleteLiveMessage] = useState<string | null>(null);

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

  async function executeAccountExport() {
    if (exportState === "pending") {
      return;
    }

    setExportState("pending");
    setExportLiveMessage("エクスポートを準備しています…");

    try {
      const response = await fetch("/api/account", {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        let messageText = "データのエクスポートに失敗しました。";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            messageText = payload.error;
          }
        } catch {
          // keep default message
        }
        setExportState("failure");
        setExportLiveMessage(messageText);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = ACCOUNT_EXPORT_DOWNLOAD_NAME;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      setExportState("success");
      setExportLiveMessage("エクスポートが完了しました。JSONファイルをダウンロードしました。");
    } catch {
      setExportState("failure");
      setExportLiveMessage(
        "データのエクスポートに失敗しました。通信環境を確認して再度お試しください。"
      );
    }
  }

  function openDeleteConfirm() {
    setShowDeleteConfirm(true);
    setDeleteInput("");
    setDeleteState("idle");
    setDeleteLiveMessage(null);
  }

  function cancelDeleteConfirm() {
    if (deleteState === "pending" || deleteState === "success") {
      return;
    }
    setShowDeleteConfirm(false);
    setDeleteInput("");
    setDeleteState("idle");
    setDeleteLiveMessage(null);
  }

  async function executeAccountDataDeletion() {
    if (deleteState === "pending" || deleteState === "success") {
      return;
    }
    if (deleteInput !== ACCOUNT_DELETION_CONFIRMATION) {
      return;
    }

    setDeleteState("pending");
    setDeleteLiveMessage("アカウントデータを削除しています…");

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
        setDeleteState("failure");
        setDeleteLiveMessage(messageText);
        return;
      }

      setDeleteState("success");
      setDeleteLiveMessage("アカウントデータの削除が完了しました。ログアウトします…");

      // Give the polite live region a beat to announce before navigation.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 400);
      });

      try {
        await signOut({ callbackUrl: "/" });
      } catch {
        setDeleteState("signOutFailure");
        setDeleteLiveMessage(
          "アカウントデータの削除は完了しましたが、ログアウトに失敗しました。ページを再読み込みするか、手動でログアウトしてください。"
        );
      }
    } catch {
      setDeleteState("failure");
      setDeleteLiveMessage(
        "アカウントデータの削除に失敗しました。通信環境を確認して再度お試しください。"
      );
    }
  }

  const exportPending = exportState === "pending";
  const deletePending = deleteState === "pending" || deleteState === "success";
  const canSubmitDeletion =
    !deletePending &&
    deleteState !== "signOutFailure" &&
    deleteInput === ACCOUNT_DELETION_CONFIRMATION;

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

      <section className="settings-panel" aria-labelledby="account-data-export-heading">
        <h2 id="account-data-export-heading">アカウントデータのエクスポート</h2>
        <p>
          このアプリに保存した視聴ステータス・ボード・共有・通知設定などのデータを、JSONファイルとしてダウンロードできます。通知の暗号鍵や端末の認証情報など、秘密値は含まれません。
        </p>
        <div className="settings-export-actions">
          <button
            type="button"
            className="command-button"
            disabled={exportPending}
            onClick={() => void executeAccountExport()}
          >
            {exportPending ? "エクスポート中..." : "データをエクスポート"}
          </button>
          {exportState === "failure" ? (
            <button
              type="button"
              className="command-button"
              disabled={exportPending}
              onClick={() => void executeAccountExport()}
            >
              再試行
            </button>
          ) : null}
        </div>
        {exportLiveMessage ? (
          <div
            className={exportState === "failure" ? "notice" : "notice success"}
            role={exportState === "failure" ? "alert" : "status"}
            aria-live={exportState === "failure" ? "assertive" : "polite"}
          >
            {exportLiveMessage}
          </div>
        ) : null}
      </section>

      <section className="settings-panel" aria-labelledby="account-data-deletion-heading">
        <h2 id="account-data-deletion-heading">アカウントデータの削除</h2>
        {!showDeleteConfirm ? (
          <>
            <p>
              このアプリに保存した視聴ステータス・ボード・共有・通知設定などのデータを削除できます。Googleアカウント自体は削除されません。
            </p>
            <p>
              削除対象はアプリ内データです。Google側に残る情報、バックアップや障害復旧用の複製、ログやキャッシュ、外部サービス側のデータまでは含められず、完全削除や保持期限を保証するものではありません。
            </p>
            <button type="button" className="command-button" onClick={openDeleteConfirm}>
              アカウントデータを削除する
            </button>
          </>
        ) : (
          <>
            <p>
              この操作は取り消せません。アプリ内のデータは削除されます。Googleアカウントは削除されません。
            </p>
            <p>
              バックアップ／障害復旧用の複製、ログ、キャッシュ、外部連携側に残る情報まで含めた完全削除は保証しません。
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
                disabled={deletePending || deleteState === "signOutFailure"}
                onChange={(event) => {
                  setDeleteInput(event.target.value);
                  if (deleteState === "failure") {
                    setDeleteState("idle");
                    setDeleteLiveMessage(null);
                  }
                }}
                placeholder={ACCOUNT_DELETION_CONFIRMATION}
              />
            </label>
            {deleteLiveMessage ? (
              <div
                className={
                  deleteState === "failure" || deleteState === "signOutFailure"
                    ? "notice"
                    : deleteState === "success"
                      ? "notice success"
                      : "notice"
                }
                role={
                  deleteState === "failure" || deleteState === "signOutFailure"
                    ? "alert"
                    : "status"
                }
                aria-live={
                  deleteState === "failure" || deleteState === "signOutFailure"
                    ? "assertive"
                    : "polite"
                }
              >
                {deleteLiveMessage}
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
              {deleteState === "failure" ? (
                <button
                  type="button"
                  className="command-button"
                  disabled={!canSubmitDeletion}
                  onClick={() => void executeAccountDataDeletion()}
                >
                  削除を再試行する
                </button>
              ) : deleteState === "signOutFailure" ? (
                <button
                  type="button"
                  className="command-button"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                >
                  ログアウトを再試行する
                </button>
              ) : (
                <button
                  type="button"
                  className="command-button"
                  disabled={!canSubmitDeletion}
                  onClick={() => void executeAccountDataDeletion()}
                >
                  {deleteState === "pending" || deleteState === "success"
                    ? "削除中..."
                    : "削除を実行する"}
                </button>
              )}
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
