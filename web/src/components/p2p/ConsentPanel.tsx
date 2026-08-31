"use client";

import { useState } from "react";

export default function ConsentPanel({
  actionLabel,
  onAccept,
  busy = false,
}: {
  actionLabel: string;
  onAccept: () => void;
  busy?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <section className="panel p-5" aria-labelledby="live-message-consent-title">
      <h1 id="live-message-consent-title" className="text-xl font-bold">Live, direct messages</h1>
      <p className="mt-2 text-sm text-white/70">
        This proof connects two browsers directly. Please understand the privacy and reliability tradeoffs before going online.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-white/75">
        <li>Your IP and network addresses may be visible to the other person.</li>
        <li>Cloudflare&apos;s STUN service can observe connection metadata.</li>
        <li>Echo relays encrypted connection metadata that expires after ten minutes, but never message text.</li>
        <li>Both people must be online. Messages disappear when either person leaves or reloads.</li>
        <li>Only text is supported. There are no uploads, media, previews, calls, notifications, or history.</li>
        <li>There is no TURN relay, so the direct connection will fail on some networks.</li>
      </ul>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>I understand and want this browser to attempt a direct connection.</span>
      </label>
      <button
        type="button"
        className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!accepted || busy}
        onClick={onAccept}
      >
        {busy ? "Preparing…" : actionLabel}
      </button>
    </section>
  );
}
