import type { ReactNode } from "react";
import "./async-state.css";

export type AsyncStateAction = {
  /** Japanese label for the action button (caller-supplied). */
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type AsyncStateBase = {
  /** Primary Japanese copy (caller-supplied). */
  title: string;
  /** Optional supporting Japanese copy. */
  description?: string;
  className?: string;
  children?: ReactNode;
};

export type AsyncStateLoadingProps = AsyncStateBase & {
  status: "loading";
};

export type AsyncStateEmptyProps = AsyncStateBase & {
  status: "empty";
  /** Optional primary action (e.g. 「作品を探す」). */
  action?: AsyncStateAction;
};

export type AsyncStateErrorProps = AsyncStateBase & {
  status: "error";
  /** Optional retry action (e.g. 「再試行」). */
  action?: AsyncStateAction;
};

export type AsyncStateSuccessProps = AsyncStateBase & {
  status: "success";
  /** Optional follow-up action (e.g. 「取り消す」). */
  action?: AsyncStateAction;
};

export type AsyncStateProps =
  | AsyncStateLoadingProps
  | AsyncStateEmptyProps
  | AsyncStateErrorProps
  | AsyncStateSuccessProps;

const STATUS_EYEBROW: Record<AsyncStateProps["status"], string> = {
  loading: "読み込み中",
  empty: "空の状態",
  error: "エラー",
  success: "完了",
};

function joinClassNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function ActionButton({
  action,
  variant,
}: {
  action: AsyncStateAction;
  variant: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      className={joinClassNames(
        "async-state__button",
        variant === "primary"
          ? "async-state__button--primary"
          : "async-state__button--secondary",
      )}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.label}
    </button>
  );
}

/**
 * Typed Loading / Empty / Error / Success surface.
 * Copy is caller-supplied (Japanese). Not wired into existing screens.
 */
export function AsyncState(props: AsyncStateProps) {
  const { status, title, description, className, children } = props;

  const action =
    status === "empty" || status === "error" || status === "success"
      ? props.action
      : undefined;

  // aria-live only for error/success (loading/empty stay silent).
  // role="alert" implies assertive; role="status" implies polite.
  const role =
    status === "error"
      ? ("alert" as const)
      : status === "success"
        ? ("status" as const)
        : undefined;

  return (
    <div
      className={joinClassNames(
        "async-state",
        `async-state--${status}`,
        className,
      )}
      data-status={status}
      role={role}
      aria-live={
        status === "error"
          ? "assertive"
          : status === "success"
            ? "polite"
            : undefined
      }
      aria-busy={status === "loading" ? true : undefined}
    >
      <p className="async-state__eyebrow">{STATUS_EYEBROW[status]}</p>
      <div className="async-state__body">
        <h3 className="async-state__title">{title}</h3>
        {description ? (
          <p className="async-state__description">{description}</p>
        ) : null}
        {children}
      </div>

      {status === "loading" ? (
        <div className="async-state__skeleton" aria-hidden="true">
          <span className="async-state__skeleton-bar async-state__skeleton-bar--lg" />
          <span className="async-state__skeleton-bar async-state__skeleton-bar--md" />
          <span className="async-state__skeleton-bar async-state__skeleton-bar--sm" />
        </div>
      ) : null}

      {action ? (
        <div className="async-state__actions">
          <ActionButton
            action={action}
            variant={status === "empty" || status === "error" ? "primary" : "secondary"}
          />
        </div>
      ) : null}
    </div>
  );
}

export default AsyncState;
