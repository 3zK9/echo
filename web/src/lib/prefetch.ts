"use client";

import { mutate } from "swr";
import { keys } from "@/lib/keys";

export async function prefetchProfile(username: string, limit = 20) {
  try {
    const [echoes, likes] = await Promise.all([
      fetch(`/api/users/${encodeURIComponent(username)}/echoes?limit=${limit}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch(`/api/users/${encodeURIComponent(username)}/likes?limit=${limit}&offset=0`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]);
    if (echoes) mutate(keys.profileEchoes(username, null, limit), echoes, { revalidate: false });
    if (likes) mutate(keys.profileLikes(username, 0, limit), likes, { revalidate: false });
  } catch {}
}

export async function prefetchProfileMetaToLocal(username: string) {
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(username)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const key = "echo_profiles_v1";
    const lower = username.toLowerCase();
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    let store: Record<string, { bio?: string; link?: string | null }> = {};
    if (raw) {
      try { store = JSON.parse(raw) as any; } catch { store = {}; }
    }
    store[lower] = { ...(store[lower] || {}), bio: data?.bio || "", link: data?.link ?? null };
    if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(store));
  } catch {}
}
