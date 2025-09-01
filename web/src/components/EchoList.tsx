"use client";

import React, { useEffect, useState } from "react";
import EchoItem, { type Echo } from "@/components/Echo";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { mutate } from "swr";

export default function EchoList({ items, username }: { items: Echo[]; username?: string }) {
  const { data: session } = useSession();
  const { show } = useToast();
  const confirm = useConfirm();
  const [echoes, setEchoes] = useState<Echo[]>(items);

  // Keep local state in sync when parent provides new items (e.g., tab switch)
  useEffect(() => {
    setEchoes(items);
  }, [items]);

  const toggleLike = async (id: string) => {
    const base = echoes.find((t) => t.id === id);
    const baseId = base?.originalId ?? id;
    if (!baseId) return;
    const prevState = echoes;
    // optimistic apply to all rows of same base
    setEchoes((prev) => prev.map((t) => {
      if ((t.originalId ?? t.id) !== baseId) return t;
      const liked = !t.liked;
      const likes = Math.max(0, (t.likes || 0) + (liked ? 1 : -1));
      return { ...t, liked, likes };
    }));
    try {
      const res = await fetch(`/api/echoes/${baseId}/like`, { method: "POST" });
      if (!res.ok) throw new Error("like_failed");
      const { likes, liked } = await res.json();
      setEchoes((prev) => prev.map((t) => ((t.originalId ?? t.id) === baseId ? { ...t, liked, likes } : t)));
      // Revalidate Home and this profile's caches
      try {
        await mutate((key) => Array.isArray(key) && key[0] === "home-echoes", undefined, { revalidate: true });
        if (username) await mutate((key) => Array.isArray(key) && key[0] === "profile-echoes" && (key[1] as string).toLowerCase() === username.toLowerCase(), undefined, { revalidate: true });
      } catch {}
    } catch {
      setEchoes(prevState);
      show("Failed to like echo");
    }
  };

  const toggleRepost = async (id: string) => {
    const meHandle = (session?.user?.username || "you").toLowerCase();
    const meName = session?.user?.name || "You";
    const meAvatar = session?.user?.image || undefined;
    const base = echoes.find((t) => t.id === id);
    const baseId = base?.originalId ?? id;
    if (!baseId) return;
    const prevState = echoes;
    const baseRow = echoes.find((t) => (t.originalId ?? t.id) === baseId && !t.isRepost) || base;
    const already = echoes.some((t) => t.originalId === baseId && t.handle.toLowerCase() === meHandle);

    // optimistic update
    if (already) {
      setEchoes((prev) => prev
        .filter((t) => !(t.originalId === baseId && t.handle.toLowerCase() === meHandle))
        .map((t) => ((t.originalId ?? t.id) === baseId ? { ...t, reposted: false, reposts: Math.max(0, (t.reposts || 0) - 1) } : t))
      );
    } else if (baseRow) {
      const tempId = `temp_re_${baseId}_${Math.random().toString(36).slice(2)}`;
      const newRepost: Echo = {
        id: tempId,
        name: meName,
        handle: meHandle,
        time: "now",
        text: baseRow.text,
        likes: baseRow.likes,
        reposts: (baseRow.reposts || 0) + 1,
        liked: baseRow.liked,
        reposted: true,
        avatarUrl: meAvatar,
        originalId: baseId,
        isRepost: true,
        canDelete: false,
      } as any;
      setEchoes((prev) => {
        const ndx = prev.findIndex((t) => t.id === baseRow!.id);
        const updated = prev.map((t) => ((t.originalId ?? t.id) === baseId ? { ...t, reposted: true, reposts: (t.reposts || 0) + 1 } : t));
        return ndx >= 0 ? [...updated.slice(0, ndx + 1), newRepost, ...updated.slice(ndx + 1)] : [newRepost, ...updated];
      });
    }

    try {
      const res = await fetch(`/api/echoes/${baseId}/repost`, { method: "POST" });
      if (!res.ok) throw new Error("repost_failed");
      const { reposts, reposted } = await res.json();
      setEchoes((prev) => prev.map((t) => ((t.originalId ?? t.id) === baseId ? { ...t, reposts, reposted } : t)));
      if (!reposted) {
        setEchoes((prev) => prev.filter((t) => !(t.originalId === baseId && (t.id as any)?.toString().startsWith("temp_re_"))));
      }
      // Revalidate Home and this profile's caches
      try {
        await mutate((key) => Array.isArray(key) && key[0] === "home-echoes", undefined, { revalidate: true });
        if (username) await mutate((key) => Array.isArray(key) && key[0] === "profile-echoes" && (key[1] as string).toLowerCase() === username.toLowerCase(), undefined, { revalidate: true });
      } catch {}
    } catch {
      setEchoes(prevState);
      show("Failed to repost echo");
    }
  };

  const onShare = async (id: string) => {
    const { origin } = window.location;
    const url = `${origin}/profile#t-${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: "Echo", text: "Check out this echo" });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        show("Link copied to clipboard");
      }
    } catch {}
  };

  const onReply = (id: string) => {
    if (typeof window !== "undefined") {
      const baseId = id;
      window.location.href = `/echo/${encodeURIComponent(baseId)}`;
    }
  };

  const onDelete = async (id: string) => {
    const okConfirm = await confirm("Delete this echo?", { title: "Delete Echo", confirmText: "Delete" });
    if (!okConfirm) return;
    try {
      const res = await fetch(`/api/echoes/${id}`, { method: "DELETE" });
      if (!res.ok) { show("Failed to delete echo"); return; }
      setEchoes((prev) => prev.filter((t) => t.id !== id && t.originalId !== id));
      show("Echo deleted");
    } catch {
      show("Failed to delete echo");
    }
  };


  // Deduplicate by id to avoid any accidental duplicates from upstream
  const uniqueEchoes = (() => {
    const seen = new Set<string>();
    const out: Echo[] = [] as any;
    for (const e of echoes) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  })();

  return (
    <div className="panel mt-4 overflow-hidden">
      {uniqueEchoes.map((t) => {
        const baseId = t.originalId ?? t.id;
        const repostedByMe = uniqueEchoes.some((x) => (x.originalId ?? x.id) === baseId && x.reposted);
        return (
          <EchoItem
            key={t.id}
            t={t}
            onLike={() => toggleLike(t.id)}
            onRepost={() => toggleRepost(t.id)}
            onShare={() => onShare(t.id)}
            onReply={() => onReply(t.originalId ?? t.id)}
            repostedByMe={repostedByMe}
            likesCount={t.likes}
            repostsCount={t.reposts}
            likedByMe={t.liked}
            onDelete={() => onDelete(t.id)}
          />
        );})}
      {echoes.length === 0 && (
        <div className="px-6 py-12 text-center text-white/60">Nothing here yet.</div>
      )}
    </div>
  );
}
