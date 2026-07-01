"use client";

import { useEffect, useRef } from "react";

/** Accessible modal shell shared across the app's help / preview dialogs. The a11y behaviour is
 *  ported verbatim from the original DepthHelp implementation: focus trap + initial/restore focus,
 *  Escape + backdrop close, body-scroll lock, and aria-modal/labelled. Presentational only — callers
 *  own the open state and the content. Matches the existing SafetyRoutes design system. */
export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  titleId = "modal-title",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  titleId?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Keep the latest onClose in a ref so the focus/scroll-lock effect below can depend on [open]
  // ALONE. Consumers pass a fresh onClose closure every render (and re-render on each keystroke of a
  // modal with controlled inputs, e.g. the email form); depending on onClose would re-run the effect
  // on every render and yank focus back to the × button after each keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // remember the trigger, lock body scroll, pull focus into the dialog
    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!f || f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]); // intentionally [open] only — onClose is read via onCloseRef (see above)

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative z-10 max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            {eyebrow && (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-route-deep">
                {eyebrow}
              </p>
            )}
            <h2
              id={titleId}
              className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
            >
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-lg px-2 py-0.5 text-[22px] leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="flex justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** The shared "documentation" trigger — a subtle text link rendered under a step's lede (and on the
 *  report's Trivy card). Keeps every doc-modal opener visually identical. */
export function HelpLink({
  onClick,
  label = "How this step works →",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[12px] font-bold text-route-deep hover:underline"
    >
      <span aria-hidden="true">? </span>
      {label}
    </button>
  );
}
