"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import "./bottom-sheet.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type BottomSheetProps = {
  /** Controlled open state. */
  open: boolean;
  /** Controlled open change handler (false = request close). */
  onOpenChange: (open: boolean) => void;
  /** Sheet body content. */
  children: ReactNode;
  /**
   * Accessible name. Prefer a string (linked via aria-labelledby)
   * or pass a custom node with titleId.
   */
  title?: ReactNode;
  /** Optional accessible description (linked via aria-describedby). */
  description?: ReactNode;
  className?: string;
  /** Optional explicit title element id. */
  titleId?: string;
  /** Optional explicit description element id. */
  descriptionId?: string;
  /** Optional aria-label when no title is provided. */
  "aria-label"?: string;
  /** Element to focus when the sheet opens (defaults to first focusable / panel). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Show a header close control. Default true. */
  showCloseButton?: boolean;
  /** Accessible label for the close button. Default 「閉じる」. */
  closeLabel?: string;
};

function joinClassNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function isElementVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => isElementVisible(el) && el.tabIndex !== -1,
  );
}

/**
 * Reusable accessible controlled bottom sheet foundation.
 * Mobile: bottom-anchored sheet. Desktop: centered dialog-like presentation.
 * Not wired into existing screens (see StatusBottomSheet for current product usage).
 */
export function BottomSheet({
  open,
  onOpenChange,
  children,
  title,
  description,
  className,
  titleId: titleIdProp,
  descriptionId: descriptionIdProp,
  "aria-label": ariaLabel,
  initialFocusRef,
  showCloseButton = true,
  closeLabel = "閉じる",
}: BottomSheetProps) {
  const reactId = useId();
  const titleId = titleIdProp ?? `bottom-sheet-title-${reactId}`;
  const descriptionId = descriptionIdProp ?? `bottom-sheet-desc-${reactId}`;

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);

  const requestClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Body scroll lock + focus management while open.
  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusTarget =
      initialFocusRef?.current ??
      (panel ? getFocusableElements(panel)[0] : null) ??
      panel;

    // Defer to ensure portal content is painted.
    const frame = window.requestAnimationFrame(() => {
      focusTarget?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousBodyOverflowRef.current ?? "";
      previousBodyOverflowRef.current = null;

      const restore = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (restore && typeof restore.focus === "function") {
        restore.focus();
      }
    };
  }, [open, initialFocusRef]);

  // Escape close + focus trap (document-level so focus cannot escape).
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeInside = panelRef.current.contains(active);

      if (event.shiftKey) {
        if (!activeInside || active === first || active === panelRef.current) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, requestClose]);

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  if (!open || typeof document === "undefined") {
    return null;
  }

  const hasTitle = title != null && title !== false;
  const hasDescription = description != null && description !== false;
  // Header hosts description when present; solo only when no header (avoids duplicate id).
  const showHeader = hasTitle || showCloseButton;
  const descriptionInHeader = hasDescription && showHeader;
  const descriptionSolo = hasDescription && !showHeader;

  const sheet = (
    <div
      className="bottom-sheet-root"
      data-state="open"
    >
      <div
        className="bottom-sheet__backdrop"
        role="presentation"
        onClick={handleBackdropClick}
      />
      <div
        ref={panelRef}
        className={joinClassNames("bottom-sheet", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-describedby={hasDescription ? descriptionId : undefined}
        aria-label={!hasTitle ? ariaLabel : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bottom-sheet__handle" aria-hidden="true" />

        {showHeader ? (
          <header className="bottom-sheet__header">
            <div className="bottom-sheet__header-text">
              {hasTitle ? (
                <h2 id={titleId} className="bottom-sheet__title">
                  {title}
                </h2>
              ) : null}
              {descriptionInHeader ? (
                <p id={descriptionId} className="bottom-sheet__description">
                  {description}
                </p>
              ) : null}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                className="bottom-sheet__close"
                onClick={requestClose}
                aria-label={closeLabel}
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </header>
        ) : null}

        {descriptionSolo ? (
          <p id={descriptionId} className="bottom-sheet__description bottom-sheet__description--solo">
            {description}
          </p>
        ) : null}

        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

export default BottomSheet;
