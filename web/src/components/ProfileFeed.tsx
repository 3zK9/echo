"use client";

import { useEffect, useRef } from "react";
import EchoList from "@/components/EchoList";
import { EchoSkeletonList } from "@/components/Skeletons";
import useSWRInfinite from "swr/infinite";
import { keys } from "@/lib/keys";
import type { Echo } from "@/components/Echo";

export default function ProfileFeed({ username, tab, initialEchoes, initialLikes, initialReplies, initialEchoCursor = null, initialLikesOffset = null, initialRepliesCursor = null }: { username: string; tab: "echoes" | "likes" | "replies"; initialEchoes?: Echo[]; initialLikes?: Echo[]; initialReplies?: Echo[]; initialEchoCursor?: string | null; initialLikesOffset?: number | null; initialRepliesCursor?: string | null }) {
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

  // Replies SWR (cursor-based)
  const repliesFallback = initialReplies ? [{ items: initialReplies, nextCursor: initialRepliesCursor ?? null }] : undefined;
  const { data: rdata, size: rsize, setSize: rsetSize, isValidating: rvalid } = useSWRInfinite(
    (index, prev) => {
      if (index === 0) return keys.profileReplies(username, null, LIMIT);
      if (prev && prev.nextCursor === null) return null;
      const cursor = prev?.nextCursor ?? null;
      return keys.profileReplies(username, cursor, LIMIT);
    },
    async ([, uname, cursor, limit]) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", String(cursor));
      const res = await fetch(`/api/users/${encodeURIComponent(String(uname))}/replies?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_replies_failed");
      return res.json();
    },
    { revalidateFirstPage: false, parallel: true, initialSize: 1, fallbackData: repliesFallback }
  );

  const echoItems = edata ? edata.flatMap((p: any) => p.items as Echo[]) : [];
  const likeItems = ldata ? ldata.flatMap((p: any) => p.items as Echo[]) : [];
  const activeItemsRaw = tab === "echoes" ? echoItems : (tab === "likes" ? likeItems : (rdata ? rdata.flatMap((p: any) => p.items as Echo[]) : []));
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
  const hasMore = tab === "echoes"
    ? (edata ? edata[edata.length - 1]?.nextCursor != null : false)
    : tab === "likes"
      ? (ldata ? ldata[ldata.length - 1]?.nextOffset != null : false)
      : (rdata ? rdata[rdata.length - 1]?.nextCursor != null : false);
  const loading = tab === "echoes"
    ? (evalid && echoItems.length === 0)
    : tab === "likes"
      ? (lvalid && likeItems.length === 0)
      : (rvalid && (rdata ? rdata.flatMap((p: any) => p.items as Echo[]).length === 0 : true));

  // Prefetch the other tab for instant switching
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (tab === "echoes") { lsetSize(1); rsetSize(1); }
      else if (tab === "likes") { esetSize(1); rsetSize(1); }
      else { esetSize(1); lsetSize(1); }
    });
    return () => cancelAnimationFrame(id);
  }, [username, tab, lsetSize, esetSize, rsetSize]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && hasMore) {
          if (tab === "echoes") esetSize(esize + 1); else if (tab === "likes") lsetSize(lsize + 1); else rsetSize(rsize + 1);
        }
      });
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, esize, lsize, rsize, tab, esetSize, lsetSize, rsetSize]);

  if (loading && activeItems.length === 0) return <EchoSkeletonList count={4} />;
  return (
    <>
      <EchoList items={activeItems} username={username} likedByUser={tab === "likes" ? username : undefined} />
      <div ref={sentinelRef} />
    </>
  );
}
