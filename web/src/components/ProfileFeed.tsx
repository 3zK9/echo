"use client";

import { useEffect, useRef, useState } from "react";
import EchoList from "@/components/EchoList";
import { EchoSkeletonList } from "@/components/Skeletons";
import type { Echo } from "@/components/Echo";

export default function ProfileFeed({ username, tab }: { username: string; tab: "echoes" | "likes" }) {
  const [items, setItems] = useState<Echo[] | null>(null);
  const [echoesCache, setEchoesCache] = useState<Echo[] | null>(null);
  const [likesCache, setLikesCache] = useState<Echo[] | null>(null);
  const initRef = useRef(false);

  // Fetch both lists when username changes
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setEchoesCache(null);
    setLikesCache(null);

    const fetchEchoes = fetch(`/api/users/${encodeURIComponent(username)}/echoes`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [] as Echo[]);
    const fetchLikes = fetch(`/api/users/${encodeURIComponent(username)}/likes`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [] as Echo[]);

    Promise.all([fetchEchoes, fetchLikes]).then(([echoes, likes]) => {
      if (cancelled) return;
      setEchoesCache(echoes as Echo[]);
      setLikesCache(likes as Echo[]);
      setItems((tab === "likes" ? (likes as Echo[]) : (echoes as Echo[])) || []);
    });

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
      fetch(`/api/users/${encodeURIComponent(username)}/likes`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => { setLikesCache(data as Echo[]); if (tab === "likes") setItems(data as Echo[]); })
        .catch(() => {});
    } else {
      if (echoesCache) setItems(echoesCache);
      else setItems(null);
      fetch(`/api/users/${encodeURIComponent(username)}/echoes`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => { setEchoesCache(data as Echo[]); if (tab === "echoes") setItems(data as Echo[]); })
        .catch(() => {});
    }
  }, [tab]);

  if (items === null) return <EchoSkeletonList count={4} />;
  return <EchoList items={items} />;
}
