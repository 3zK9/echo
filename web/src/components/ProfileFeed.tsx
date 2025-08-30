"use client";

import { useEffect, useRef } from "react";
import EchoList from "@/components/EchoList";
import { EchoSkeletonList } from "@/components/Skeletons";
import useSWRInfinite from "swr/infinite";
import { keys } from "@/lib/keys";
import type { Echo } from "@/components/Echo";

export default function ProfileFeed({ username, tab, initialEchoes, initialLikes, initialEchoCursor = null, initialLikesOffset = null }: { username: string; tab: "echoes" | "likes"; initialEchoes?: Echo[]; initialLikes?: Echo[]; initialEchoCursor?: string | null; initialLikesOffset?: number | null }) {
  const LIMIT = 20;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Echoes SWR (cursor-based)
  const echoFallback = initialEchoes ? [{ items: initialEchoes, nextCursor: initialEchoCursor ?? null }] : undefined;
  const { data: edata, size: esize, setSize: esetSize, isValidating: evalid } = useSWRInfinite(
    (index, prev) => {
      if (index === 0) return keys.profileEchoes(username, null, LIMIT);
      if (prev && prev.nextCursor === null) return null;
      const cursor = prev?.nextCursor ?? null;
      return keys.profileEchoes(username, cursor, LIMIT);
    },
    async ([, uname, cursor, limit]) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", String(cursor));
      const res = await fetch(`/api/users/${encodeURIComponent(String(uname))}/echoes?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_echoes_failed");
      return res.json();
    },
    { revalidateFirstPage: false, parallel: true, initialSize: 1, fallbackData: echoFallback }
  );

  // Likes SWR (offset-based)
  const likesFallback = initialLikes ? [{ items: initialLikes, nextOffset: initialLikesOffset ?? null }] : undefined;
  const { data: ldata, size: lsize, setSize: lsetSize, isValidating: lvalid } = useSWRInfinite(
    (index, prev) => {
      if (prev && prev.nextOffset === null) return null;
      const offset = index * LIMIT;
      return keys.profileLikes(username, offset, LIMIT);
    },
    async ([, uname, offset, limit]) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const res = await fetch(`/api/users/${encodeURIComponent(String(uname))}/likes?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_likes_failed");
      return res.json();
    },
    { revalidateFirstPage: false, parallel: true, initialSize: 1, fallbackData: likesFallback }
  );

  const echoItems = edata ? edata.flatMap((p: any) => p.items as Echo[]) : [];
  const likeItems = ldata ? ldata.flatMap((p: any) => p.items as Echo[]) : [];
  const activeItemsRaw = tab === "echoes" ? echoItems : likeItems;
  const activeItems = (() => {
    const seen = new Set<string>();
    const out: Echo[] = [] as any;
    for (const it of activeItemsRaw) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
    return out;
  })();
  const hasMore = tab === "echoes" ? (edata ? edata[edata.length - 1]?.nextCursor != null : false) : (ldata ? ldata[ldata.length - 1]?.nextOffset != null : false);
  const loading = tab === "echoes" ? (evalid && echoItems.length === 0) : (lvalid && likeItems.length === 0);

  // Prefetch the other tab for instant switching
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (tab === "echoes") lsetSize(1); else esetSize(1);
    });
    return () => cancelAnimationFrame(id);
  }, [username]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && hasMore) {
          if (tab === "echoes") esetSize(esize + 1); else lsetSize(lsize + 1);
        }
      });
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, esize, lsize, tab]);

  if (loading && activeItems.length === 0) return <EchoSkeletonList count={4} />;
  return (
    <>
      <EchoList items={activeItems} username={username} />
      <div ref={sentinelRef} />
    </>
  );
}
