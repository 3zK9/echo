"use client";

import { useEffect, useState } from "react";
import EchoList from "@/components/EchoList";
import type { Echo } from "@/components/Echo";

export default function ProfileFeed({ username, tab }: { username: string; tab: "echoes" | "likes" }) {
  const [items, setItems] = useState<Echo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const url = tab === "likes" ? `/api/users/${encodeURIComponent(username)}/likes` : `/api/users/${encodeURIComponent(username)}/echoes`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return setItems([]);
        const data = (await res.json()) as Echo[];
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setItems([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [username, tab]);

  if (items === null) return <div className="panel mt-4 px-6 py-8 text-center text-white/60">Loading…</div>;
  return <EchoList items={items} />;
}
