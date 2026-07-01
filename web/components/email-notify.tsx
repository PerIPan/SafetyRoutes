"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";

/** DISPLAY-ONLY "email me report updates" preview. Collects name / email / frequency / repeat-count
 *  into LOCAL state and shows an in-modal confirmation on save. There is intentionally NO backend:
 *  no fetch, no persistence, nothing is sent. It previews a not-yet-built feature. */
export function EmailNotifyButton() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [freq, setFreq] = useState<"weekly" | "monthly">("weekly");
  const [times, setTimes] = useState("4"); // raw string so the field can be cleared mid-edit
  const confirmRef = useRef<HTMLDivElement>(null);

  // clamped numeric view of the repeat count for display (the input keeps the raw string)
  const n = Math.max(1, Math.min(52, Number(times) || 1));

  // closing drops only the saved-confirmation view; typed values persist for the session
  function close() {
    setOpen(false);
    setSaved(false);
  }

  // on save, move focus to the confirmation (role="status") so keyboard users stay inside the dialog
  // and screen readers announce the result
  useEffect(() => {
    if (saved) confirmRef.current?.focus();
  }, [saved]);

  const input =
    "w-full rounded-xl border-[1.5px] border-line bg-[#FBFDFC] px-4 py-2.5 text-[14px] text-ink outline-none focus:border-route";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border-[1.5px] border-line bg-surface px-5 py-3 text-[14.5px] font-semibold text-ink-soft"
      >
        🔔 Email notifications
      </button>

      <Modal
        open={open}
        onClose={close}
        eyebrow="Notifications"
        title="Email me report updates"
        titleId="email-notify-title"
        footer={
          saved ? (
            <button
              onClick={close}
              className="rounded-xl bg-route px-5 py-2.5 text-[14px] font-semibold text-white"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={close}
                className="rounded-xl border-[1.5px] border-line bg-surface px-5 py-2.5 text-[14px] font-semibold text-ink-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => setSaved(true)}
                className="rounded-xl bg-route px-5 py-2.5 text-[14px] font-semibold text-white"
              >
                Save preferences
              </button>
            </>
          )
        }
      >
        {saved ? (
          <div
            ref={confirmRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className="outline-none"
          >
            <p className="text-[14px] leading-relaxed text-ink">
              🔔 You’re set — we’ll email <b>{email.trim() || "you"}</b>{" "}
              {freq === "weekly" ? "weekly" : "monthly"} for <b>{n}</b> update
              {n === 1 ? "" : "s"}, then it stops.
            </p>
            <p className="mt-2 text-[12.5px] text-muted">
              Preview — email notifications aren’t active yet, so nothing was saved or sent.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[12.5px] leading-relaxed text-muted">
              A preview of report email reminders. Fill it in to see how it would work — this isn’t
              wired up yet, so nothing is saved or sent.
            </p>
            <label className="block">
              <span className="mb-1 block text-[13px] font-semibold text-ink">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className={input}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-semibold text-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@yourcharity.org"
                className={input}
              />
            </label>
            <div>
              <span id="email-freq-label" className="mb-1 block text-[13px] font-semibold text-ink">
                How often
              </span>
              <div
                role="group"
                aria-labelledby="email-freq-label"
                className="inline-flex rounded-xl border-[1.5px] border-line p-0.5"
              >
                {(["weekly", "monthly"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={freq === f}
                    onClick={() => setFreq(f)}
                    className={`rounded-[10px] px-4 py-1.5 text-[13.5px] font-semibold capitalize ${
                      freq === f ? "bg-route text-white" : "text-ink-soft"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <label className="block max-w-[260px]">
              <span className="mb-1 block text-[13px] font-semibold text-ink">
                Send it how many times
              </span>
              <input
                type="number"
                min={1}
                max={52}
                value={times}
                onChange={(e) => setTimes(e.target.value)}
                onBlur={() => setTimes(String(n))}
                className={input}
              />
              <span className="mt-1 block text-[12px] text-muted">
                e.g. {n} {freq} email{n === 1 ? "" : "s"}, then it stops.
              </span>
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
