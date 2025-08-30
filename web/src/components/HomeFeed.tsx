"use client";

import { useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { EchoSkeletonList } from "@/components/Skeletons";
import EchoList from "@/components/EchoList";
import Compose from "@/components/Compose";
import type { Echo } from "@/components/Echo";

export default function HomeFeed() {
  const LIMIT = 20;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data, size, setSize, isValidating, mutate } = useSWRInfinite(
    (index, prev) => {
      if (index === 0) return ["home-echoes", null, LIMIT] as const;
      if (prev && prev.nextCursor === null) return null;
      const cursor = prev?.nextCursor ?? null;
      return ["home-echoes", cursor, LIMIT] as const;
    },
    async ([, cursor, limit]) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", String(cursor));
      const res = await fetch(`/api/echoes?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_home_failed");
      return res.json();
    },
    { revalidateFirstPage: false, parallel: true }
  );

  const itemsRaw = data ? (data.flatMap((p: any) => p.items) as Echo[]) : [];
  const items = (() => {
    const seen = new Set<string>();
    const out: Echo[] = [] as any;
    for (const e of itemsRaw) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  })();
  const hasMore = data ? data[data.length - 1]?.nextCursor != null : false;
  const loading = isValidating && items.length === 0;

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && hasMore) setSize(size + 1); });
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, size]);

  const onPost = async (text: string) => {
    // Create then mutate first page to include new echo at top
    try {
      const res = await fetch(`/api/echoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) return;
      const created = await res.json();
      await mutate((pages) => {
        if (!pages || pages.length === 0) return [{ items: [created], nextCursor: null }];
        const [first, ...rest] = pages as any[];
        return [{ ...first, items: [created, ...(first.items || [])] }, ...rest];
      }, { revalidate: false });
    } catch {}
  };

  if (loading) return <EchoSkeletonList count={5} />;
  return (
    <section className="max-w-[680px] mx-auto min-h-screen">
      <header className="panel px-4 py-3 text-xl font-bold sticky top-4 z-10">Home</header>
      <div className="panel mt-4 overflow-hidden">
        <Compose onPost={onPost} />
        <EchoList items={items} />
        <div ref={sentinelRef} />
      </div>
    </section>
  );
}
