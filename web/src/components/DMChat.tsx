"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initDevice, ensureSessionWithPeer, encryptForPeer, replenishIfNeeded, decryptFromPeer } from "@/lib/signal/client";

type Message = {
  id: string;
  fromUserId: string;
  toUserId: string;
  senderDeviceId: string;
  ciphertext: string;
  sentAt: string;
};

export default function DMChat({ peer }: { peer: string }) {
  const LIMIT = 30;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plaintexts, setPlaintexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(async (c: string | null) => {
    const params = new URLSearchParams();
    params.set("limit", String(LIMIT));
    if (c) params.set("cursor", c);
    const res = await fetch(`/api/dm/conversations/${encodeURIComponent(peer)}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setMessages((prev) => [...prev, ...(data.items || [])]);
    setCursor(data.nextCursor);
  }, [peer]);

  useEffect(() => {
    (async () => { try { await initDevice(); await ensureSessionWithPeer(peer); } catch {} })();
    setMessages([]);
    setCursor(null);
    setPlaintexts({});
    setError(null);
    fetchPage(null);
  }, [peer]);

  // Decrypt messages as they arrive
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of messages) {
        if (plaintexts[m.id]) continue;
        try {
          const text = await decryptFromPeer(peer, m.ciphertext);
          if (!cancelled) setPlaintexts((prev) => ({ ...prev, [m.id]: text }));
        } catch {
          // best-effort fallback: try base64 decode
          try {
            const fallback = atob(m.ciphertext.split(":").pop() || m.ciphertext);
            if (!cancelled) setPlaintexts((prev) => ({ ...prev, [m.id]: fallback }));
          } catch {
            if (!cancelled) setPlaintexts((prev) => ({ ...prev, [m.id]: "(unable to decrypt)" }));
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [messages, peer]);
  

  const onSend = async () => {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    try {
      await initDevice();
      // Try encryption with existing session; establish if needed inside helper
      const ciphertext = await encryptForPeer(peer, text);
      const deviceId = typeof window !== 'undefined' ? (localStorage.getItem('signal_device_id_v1') || 'web') : 'web';
      const res = await fetch(`/api/dm/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUsername: peer, senderDeviceId: deviceId, ciphertext }) });
      if (res.ok) {
        setMessages([]);
        setCursor(null);
        await fetchPage(null);
        setInput("");
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        replenishIfNeeded().catch(() => {});
        setError(null);
      } else {
        const t = await res.text().catch(() => '');
        console.warn('Failed to send message', t);
        setError("Failed to send message.");
      }
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (msg.includes('no_bundle')) setError("The recipient is not ready for encrypted messages yet. Ask them to open the app once.");
      else setError("Could not encrypt message. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="panel p-3 h-[70vh] flex flex-col">
      <div className="text-lg font-semibold mb-2">Direct Messages with @{peer}</div>
      <div ref={listRef} className="flex-1 overflow-auto flex flex-col-reverse gap-2">
        {[...messages].sort((a,b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()).map((m) => (
          <div key={m.id} className="rounded-lg bg-white/5 border border-white/10 p-2">
            <div className="text-xs text-white/60">{new Date(m.sentAt).toLocaleString()}</div>
            <div className="mt-1 whitespace-pre-wrap break-words">
              {plaintexts[m.id] || "(decrypting...)"}
            </div>
          </div>
        ))}
        {cursor && (
          <button className="mt-2 text-sm underline" onClick={() => fetchPage(cursor)} disabled={loading}>Load more</button>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 rounded-md bg-black/20 border border-white/10 p-2 outline-none" placeholder="Write a message..." />
        <button onClick={onSend} className="btn-primary px-4 py-2" disabled={loading || !input.trim()}>Send</button>
      </div>
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
      <div className="mt-2 text-xs text-white/50">End‑to‑end encryption powered by Signal sessions on your device.</div>
    </div>
  );
}
