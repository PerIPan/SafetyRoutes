"use client";

import { useEffect, useRef } from "react";
import { SCAN_PROFILE_CHECKS, type ScanProfileMeta } from "@/lib/scan-profiles";

/** Help modal for the wizard's scan-depth choice. Explanatory first, but each level is also
 *  selectable so "help me choose" ends with a choice. Accessible: focus trap + initial/restore
 *  focus, Escape + backdrop close, body-scroll lock, aria-modal/labelled. Presentation copy comes
 *  from the shared lib/scan-profiles.ts. Matches the existing SafetyRoutes design system. */
export function DepthHelp({
  open,
  onClose,
  depths,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  depths: ScanProfileMeta[];
  value: string;
  onPick: (key: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // remember the trigger, lock body scroll, pull focus into the dialog
    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="depth-help-title"
    >
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative z-10 max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-route-deep">
              Choosing a depth
            </p>
            <h2
              id="depth-help-title"
              className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
            >
              How deep should we check?
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close help"
            className="-mr-1 rounded-lg px-2 py-0.5 text-[22px] leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-soft">
            All three are <b className="text-ink">safe and read-only</b> — they only look at your
            public website and never change anything. They differ in <i>how much</i> they look at,
            and how long they take. When in doubt, pick <b className="text-ink">Standard</b>.
          </p>

          {/* comparison grid */}
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[1.7fr_repeat(3,0.8fr)] bg-paper px-3 py-2 font-mono text-[10.5px] uppercase tracking-wide text-muted">
              <span>What it checks</span>
              {depths.map((d) => (
                <span key={d.key} className="text-center">
                  {d.label}
                </span>
              ))}
            </div>
            {SCAN_PROFILE_CHECKS.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1.7fr_repeat(3,0.8fr)] items-center border-t border-[#EEF2F1] px-3 py-2 text-[12.5px]"
              >
                <span className="text-ink-soft">{row.label}</span>
                {depths.map((d) => (
                  <span key={d.key} className="text-center">
                    {row.in[d.key] ? (
                      <span className="font-bold text-route-deep">✓</span>
                    ) : (
                      <span className="text-[#CBD7D5]">–</span>
                    )}
                  </span>
                ))}
              </div>
            ))}
            <div className="grid grid-cols-[1.7fr_repeat(3,0.8fr)] items-center border-t border-[#EEF2F1] bg-[#FAFDFC] px-3 py-2 text-[12px]">
              <span className="font-semibold text-ink">Speed</span>
              {depths.map((d) => (
                <span key={d.key} className="text-center text-muted">
                  {d.speed}
                </span>
              ))}
            </div>
          </div>

          {/* selectable cards — picking one applies it and is reflected in the wizard */}
          <div className="mt-4 grid gap-2">
            {depths.map((d) => {
              const on = value === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => onPick(d.key)}
                  aria-pressed={on}
                  className={`flex items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors ${
                    on ? "border-route bg-[#F1FAFA]" : "border-line bg-white hover:border-route/50"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 ${
                      on ? "border-route" : "border-line"
                    }`}
                  >
                    {on && <span className="h-2 w-2 rounded-full bg-route" />}
                  </span>
                  <span>
                    <span className="text-[14px] font-semibold text-ink">{d.label}</span>
                    {d.key === "standard" && (
                      <span className="ml-2 rounded bg-[#E2F1F0] px-1.5 py-0.5 font-mono text-[10px] text-route-deep">
                        recommended
                      </span>
                    )}
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-soft">
                      {d.best}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end border-t border-line px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-route px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
