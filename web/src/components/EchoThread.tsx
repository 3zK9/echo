"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { EchoSkeletonList } from "@/components/Skeletons";
import EchoItem, { type Echo } from "@/components/Echo";

export default function EchoThread({ echoId }: { echoId: string }) {
  const LIMIT = 20;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");

  const { data: head } = useSWR(["echo", echoId], async () => {
    const res = await fetch(`/api/echoes/${encodeURIComponent(echoId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("fetch_head_failed");
    return res.json();
  });

  // Prefill reply textarea with @username of the author when head loads
  const headHandle = (head as any)?.handle as string | undefined;
  useEffect(() => {
    if (headHandle && !text) setText(`@${headHandle} `);
  }, [headHandle, text]);

  const { data, size, setSize, isValidating, mutate } = useSWRInfinite(
    (index, prev) => {
      if (index === 0) return ["echo-replies", echoId, null, LIMIT] as const;
      if (prev && prev.nextCursor === null) return null;
      const cursor = prev?.nextCursor ?? null;
      return ["echo-replies", echoId, cursor, LIMIT] as const;
    },
    async ([, id, cursor, limit]) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", String(cursor));
      const res = await fetch(`/api/echoes/${encodeURIComponent(String(id))}/replies?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_replies_failed");
      return res.json();
    },
    { revalidateFirstPage: false, parallel: true, initialSize: 1 }
  );

  const replies = data ? (data.flatMap((p: any) => p.items) as Echo[]) : [];
  const hasMore = data ? data[data.length - 1]?.nextCursor != null : false;
  const loading = isValidating && replies.length === 0;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && hasMore) setSize(size + 1); });
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, size, setSize]);

  const onReply = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/echoes/${encodeURIComponent(echoId)}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: trimmed }) });
      if (!res.ok) return;
      setText("");
      await mutate();
    } catch {}
  };

  if (!head) return <EchoSkeletonList count={3} />;
  return (
    <div>
      <header className="px-4 py-3 text-xl font-bold sticky top-0 z-10 bg-white/70 dark:bg-black/50 backdrop-blur border-b border-black/10 dark:border-white/10">Echo</header>
      <div className="panel mt-4 overflow-hidden">
        <EchoItem t={head} />
        <div className="px-4 py-3 border-t border-white/10">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 280))}
            rows={3}
            className="w-full rounded-md bg-black/5 dark:bg-white/10 p-2 outline-none resize-none max-h-48 overflow-auto"
            placeholder="Write a reply..."
          />
          <div className="mt-2 flex justify-end">
            <button onClick={onReply} className="btn-primary px-4 py-2">Reply</button>
          </div>
        </div>
        <div className="border-t border-white/10" />
        {loading ? (
          <EchoSkeletonList count={3} />
        ) : (
          <div className="mt-1">
            {replies.map((t) => (
              <EchoItem key={t.id} t={t} />
            ))}
            <div ref={sentinelRef} />
          </div>
        )}
      </div>
    </div>
  );
}
