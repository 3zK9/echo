"use client";

import { useEffect, useRef, useState } from "react";
import EchoList from "@/components/EchoList";
import { EchoSkeletonList } from "@/components/Skeletons";
import type { Echo } from "@/components/Echo";

export default function ProfileFeed({ username, tab, initialEchoes, initialLikes, initialEchoCursor = null, initialLikesOffset = null }: { username: string; tab: "echoes" | "likes"; initialEchoes?: Echo[]; initialLikes?: Echo[]; initialEchoCursor?: string | null; initialLikesOffset?: number | null }) {
  const [items, setItems] = useState<Echo[] | null>(initialEchoes && tab === "echoes" ? initialEchoes : initialLikes && tab === "likes" ? initialLikes : null);
  const [echoesCache, setEchoesCache] = useState<Echo[] | null>(initialEchoes ?? null);
  const [likesCache, setLikesCache] = useState<Echo[] | null>(initialLikes ?? null);
  const [echoCursor, setEchoCursor] = useState<string | null>(initialEchoCursor);
  const [likesOffset, setLikesOffset] = useState<number | null>(initialLikesOffset);
  const initRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const KEY_E = `profile:${username}:echoes:v1`;
  const KEY_L = `profile\:${username}:likes:v1`;

  // Fetch both lists when username changes
  useEffect(() => {
    let cancelled = false;
    // Try cached sessionStorage first
    try {
      const rawE = typeof window !== "undefined" ? sessionStorage.getItem(KEY_E) : null;
      const rawL = typeof window !== "undefined" ? sessionStorage.getItem(KEY_L) : null;
      const e = rawE ? (JSON.parse(rawE) as Echo[]) : null;
      const l = rawL ? (JSON.parse(rawL) as Echo[]) : null;
      if (!echoesCache && e) setEchoesCache(e);
      if (!likesCache && l) setLikesCache(l);
      if (!items) {
        if ((tab === "echoes" && (e || initialEchoes)) || (tab === "likes" && (l || initialLikes))) {
          setItems(tab === "echoes" ? (e || initialEchoes || null) : (l || initialLikes || null));
        } else setItems(null);
      }
    } catch { setItems(null); }

    // If we already have initial props, keep them and just refresh in background

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const run = async () => {
      if (tab === "likes") {
        const likes = await fetch(`/api/users/${encodeURIComponent(username)}/likes?limit=20&offset=0`, { cache: "no-store", signal })
          .then((res) => (res.ok ? res.json() : { items: [], nextOffset: null }))
          .catch(() => ({ items: [] as Echo[], nextOffset: null }));
        if (cancelled) return;
        setLikesCache((likes.items || []) as Echo[]);
        setLikesOffset((likes.nextOffset as number | null) ?? null);
        try { if (typeof window !== "undefined") sessionStorage.setItem(KEY_L, JSON.stringify(likes.items || [])); } catch {}
        if (!initialLikes) setItems((likes.items || []) as Echo[]);
      } else {
        const echoes = await fetch(`/api/users/${encodeURIComponent(username)}/echoes?limit=20`, { cache: "no-store", signal })
          .then((res) => (res.ok ? res.json() : { items: [], nextCursor: null }))
          .catch(() => ({ items: [] as Echo[], nextCursor: null }));
        if (cancelled) return;
        setEchoesCache((echoes.items || []) as Echo[]);
        setEchoCursor((echoes.nextCursor as string | null) ?? null);
        try { if (typeof window !== "undefined") sessionStorage.setItem(KEY_E, JSON.stringify(echoes.items || [])); } catch {}
        if (!initialEchoes) setItems((echoes.items || []) as Echo[]);
      }
    };
    run();

    initRef.current = true;
    return () => { cancelled = true; };
  }, [username]);

  // On tab switch, show cached list immediately if available, then refresh in background
  useEffect(() => {
    if (!initRef.current) return;
    if (tab === "likes") {
      if (likesCache) setItems(likesCache);
      else setItems(null);
      // background refresh
      fetch(`/api/users/${encodeURIComponent(username)}/likes?limit=20&offset=0`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { items: [], nextOffset: null }))
        .then((data) => {
          setLikesCache((data.items || []) as Echo[]);
          setLikesOffset((data.nextOffset as number | null) ?? null);
          try { if (typeof window !== "undefined") sessionStorage.setItem(KEY_L, JSON.stringify(data.items || [])); } catch {}
          if (tab === "likes") setItems((data.items || []) as Echo[]);
        })
        .catch(() => {});
    } else {
      if (echoesCache) setItems(echoesCache);
      else setItems(null);
      fetch(`/api/users/${encodeURIComponent(username)}/echoes?limit=20`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { items: [], nextCursor: null }))
        .then((data) => {
          setEchoesCache((data.items || []) as Echo[]);
          setEchoCursor((data.nextCursor as string | null) ?? null);
          try { if (typeof window !== "undefined") sessionStorage.setItem(KEY_E, JSON.stringify(data.items || [])); } catch {}
          if (tab === "echoes") setItems((data.items || []) as Echo[]);
        })
        .catch(() => {});
    }
  }, [tab]);

  const loadMore = async () => {
    if (tab === "echoes") {
      if (!echoCursor) return;
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/echoes?limit=20&cursor=${encodeURIComponent(echoCursor)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const next = (data.items || []) as Echo[];
        setItems((prev) => ([...(prev || []), ...next]));
        setEchoCursor((data.nextCursor as string | null) ?? null);
      } catch {}
    } else {
      if (likesOffset == null) return;
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/likes?limit=20&offset=${likesOffset}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const next = (data.items || []) as Echo[];
        setItems((prev) => ([...(prev || []), ...next]));
        setLikesOffset((data.nextOffset as number | null) ?? null);
      } catch {}
    }
  };

  if (items === null) return <EchoSkeletonList count={4} />;
  return (
    <>
      <EchoList items={items} />
      {(tab === "echoes" ? echoCursor : likesOffset != null) && (
        <div className="panel mt-4 p-3 text-center">
          <button onClick={loadMore} className="btn-primary px-6 py-2">Load more</button>
        </div>
      )}
    </>
  );
}
