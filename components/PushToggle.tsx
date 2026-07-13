"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function checkState() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "subscribed" : "unsubscribed");
    }
    void checkState();
  }, []);

  async function subscribe() {
    setWorking(true);
    setMessage(null);
    setIsError(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setMessage("通知機能が設定されていません。");
        setIsError(true);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      const subJson = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subJson)
      });

      if (!res.ok) throw new Error("保存に失敗しました。");
      setState("subscribed");
      setMessage("通知を有効にしました。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "エラーが発生しました。");
      setIsError(true);
    } finally {
      setWorking(false);
    }
  }

  async function unsubscribe() {
    setWorking(true);
    setMessage(null);
    setIsError(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      setState("unsubscribed");
      setMessage("通知を無効にしました。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "エラーが発生しました。");
      setIsError(true);
    } finally {
      setWorking(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="push-toggle-row">
        <Loader2 size={16} className="spin" />
        <span className="push-toggle-label">確認中...</span>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <p className="push-toggle-unsupported">
        このブラウザはプッシュ通知に対応していません。
        <br />
        iPhoneの場合はホーム画面に追加後にご利用ください。
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="push-toggle-denied">
        通知がブロックされています。
        <br />
        ブラウザの設定から「通知」を「許可」に変更してください。
      </p>
    );
  }

  const isOn = state === "subscribed";

  return (
    <div className="push-toggle-wrap">
      <div className="push-toggle-row">
        {isOn ? <Bell size={18} /> : <BellOff size={18} />}
        <span className="push-toggle-label">
          {isOn ? "今日の放送を通知する（ON）" : "今日の放送を通知する（OFF）"}
        </span>
        <button
          className={`push-toggle-btn${isOn ? " is-on" : ""}`}
          onClick={() => void (isOn ? unsubscribe() : subscribe())}
          disabled={working}
          aria-pressed={isOn}
          aria-label={working ? "保存中" : isOn ? "無効にする" : "有効にする"}
        >
          {working ? <Loader2 size={14} className="spin" aria-hidden="true" /> : isOn ? "無効にする" : "有効にする"}
        </button>
      </div>
      {message ? (
        <p
          className={`push-toggle-message${isError ? " is-error" : ""}`}
          role={isError ? "alert" : "status"}
          aria-live={isError ? undefined : "polite"}
        >
          {message}
        </p>
      ) : null}
      {isOn ? (
        <p className="push-toggle-hint">
          視聴中・見たいアニメの放送日に通知が届きます。
        </p>
      ) : null}
    </div>
  );
}
