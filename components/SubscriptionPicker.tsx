"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { STREAMING_SERVICES } from "@/lib/streaming-services";

type SubscriptionPickerProps = {
  initialServiceIds: string[];
  onSave: (serviceIds: string[]) => Promise<void>;
  onSkip?: () => Promise<void>;
  showSkip?: boolean;
  submitLabel?: string;
  skipLabel?: string;
  autoSave?: boolean;
};

export function SubscriptionPicker({
  initialServiceIds,
  onSave,
  onSkip,
  showSkip = false,
  submitLabel = "保存する",
  skipLabel = "スキップ",
  autoSave = false
}: SubscriptionPickerProps) {
  const [selectedIds, setSelectedIds] = useState(new Set(initialServiceIds));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(nextIds: Set<string>, previousIds?: Set<string>) {
    setSaving(true);
    setMessage(null);

    try {
      await onSave([...nextIds]);
    } catch (error) {
      if (previousIds) {
        setSelectedIds(previousIds);
      }
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  function toggleService(serviceId: string) {
    const previous = selectedIds;
    const next = new Set(previous);
    if (next.has(serviceId)) {
      next.delete(serviceId);
    } else {
      next.add(serviceId);
    }
    setSelectedIds(next);

    if (autoSave) {
      void save(next, previous);
    }
  }

  async function handleSave() {
    await save(selectedIds);
  }

  async function handleSkip() {
    if (!onSkip) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await onSkip();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "処理に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="subscription-picker">
      <div className="subscription-picker-grid" role="group" aria-label="加入中のサブスク">
        {STREAMING_SERVICES.map((service) => {
          const checked = selectedIds.has(service.id);

          return (
            <label
              key={service.id}
              className={checked ? "subscription-option is-selected" : "subscription-option"}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleService(service.id)}
                disabled={saving}
              />
              <img src={service.logoUrl} alt="" aria-hidden="true" />
              <span>{service.name}</span>
            </label>
          );
        })}
      </div>

      {message ? <div className="notice error">{message}</div> : null}

      {!autoSave ? (
        <div className="subscription-picker-actions">
          {showSkip ? (
            <button
              className="command-button"
              type="button"
              onClick={() => void handleSkip()}
              disabled={saving}
            >
              {skipLabel}
            </button>
          ) : null}
          <button
            className="command-button emphasis-button"
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <Loader2 className="spin" size={18} /> : null}
            <span>{submitLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
