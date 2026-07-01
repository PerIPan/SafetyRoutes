"use client";

export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-xl bg-route px-5 py-3 font-semibold text-white">
    Print / save as PDF
  </button>;
}
