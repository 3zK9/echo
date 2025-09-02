"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initDevice, ensureSessionWithPeer, encryptForPeer, decryptFromPeer, replenishIfNeeded } from "@/lib/signal/client";

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
    fetchPage(null);
  }, [peer, fetchPage]);

  

  const onSend = async () => {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    try {
      await initDevice();
      await ensureSessionWithPeer(peer);
      const ciphertext = await encryptForPeer(peer, text);
      const res = await fetch(`/api/dm/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUsername: peer, senderDeviceId: "web", ciphertext }) });
      if (res.ok) {
        setMessages([]);
        setCursor(null);
        await fetchPage(null);
        setInput("");
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        replenishIfNeeded().catch(() => {});
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="panel p-3 h-[70vh] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-lg font-semibold">Direct Messages with @{peer}</div>
        <SafetyNumber peer={peer} />
      </div>
      <div ref={listRef} className="flex-1 overflow-auto flex flex-col-reverse gap-2">
        {[...messages].sort((a,b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()).map((m) => (
          <div key={m.id} className="rounded-lg bg-white/5 border border-white/10 p-2">
            <div className="text-xs text-white/60">{new Date(m.sentAt).toLocaleString()}</div>
            <div className="mt-1 whitespace-pre-wrap break-words">{/* decrypted async via placeholder: show base64 fallback for now */}
              {(() => { try { return atob(m.ciphertext.split(":").pop() || m.ciphertext); } catch { return m.ciphertext; } })()}</div>
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
      <div className="mt-2 text-xs text-white/50">End‑to‑end encryption uses your device keys. This MVP uses client‑side encryption placeholder; integrate Signal next.</div>
    </div>
  );
}


function SafetyNumber({ peer }: { peer: string }) {
  const [safety, setSafety] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        const meRaw = localStorage.getItem('signal_identity_key_v1');
        if (!meRaw) return;
        const me = JSON.parse(meRaw);
        const resp = await fetch(`/api/dm/users/${encodeURIComponent(peer)}/identity`);
        if (!resp.ok) return;
        const peerId = await resp.json();
        const concat = me.pubKey + ':' + (peerId.identityKeyPub as string);
        const enc = new TextEncoder().encode(concat);
        const hashBuf = await crypto.subtle.digest('SHA-256', enc);
        const bytes = Array.from(new Uint8Array(hashBuf));
        const hex = bytes.map(b => b.toString(16).padStart(2,'0')).join('');
        const groups = hex.match(/.{1,4}/g)?.slice(0, 10) || [];
        setSafety(groups.join(' '));
      } catch {}
    })();
  }, [peer, fetchPage]);
  return (
    <div className="text-[10px] text-white/60 border border-white/10 rounded-full px-2 py-1" title="Verify this safety number with your contact">{safety || 'verifying...'}</div>
  );
}
