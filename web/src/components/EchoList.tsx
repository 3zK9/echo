"use client";

import React, { useEffect, useState } from "react";
import EchoItem, { type Echo } from "@/components/Echo";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";

export default function EchoList({ items }: { items: Echo[] }) {
  const { data: session } = useSession();
  const { show } = useToast();
  const confirm = useConfirm();
  const [echoes, setEchoes] = useState<Echo[]>(items);

  // Keep local state in sync when parent provides new items (e.g., tab switch)
  useEffect(() => {
    setEchoes(items);
  }, [items]);

  const toggleLike = async (id: string) => {
    // optimistic
    let old: Echo | null = null;
    setEchoes((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      old = t;
      const liked = !t.liked;
      const likes = Math.max(0, (t.likes || 0) + (liked ? 1 : -1));
      return { ...t, liked, likes };
    }));
    try {
      const res = await fetch(`/api/echoes/${id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { likes, liked } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === id ? { ...t, liked, likes } : t)));
    } catch {
      if (old) setEchoes((prev) => prev.map((t) => (t.id === id ? old! : t)));
    }
  };

  const toggleRepost = async (id: string) => {
    // optimistic
    let old: Echo | null = null;
    setEchoes((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      old = t;
      const reposted = !t.reposted;
      const reposts = Math.max(0, (t.reposts || 0) + (reposted ? 1 : -1));
      return { ...t, reposted, reposts };
    }));
    try {
      const res = await fetch(`/api/echoes/${id}/repost`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { reposts, reposted } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === id ? { ...t, reposts, reposted } : t)));
    } catch {
      if (old) setEchoes((prev) => prev.map((t) => (t.id === id ? old! : t)));
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

  const onReply = (id: string, handle: string) => {
    if (typeof window !== "undefined") {
      window.location.href = `/#compose`;
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

  const me = session?.user?.username || "you";

  return (
    <div className="panel mt-4 overflow-hidden">
      {echoes.map((t) => (
        <EchoItem
          key={t.id}
          t={t}
          onLike={() => toggleLike(t.id)}
          onRepost={() => toggleRepost(t.id)}
          onShare={() => onShare(t.id)}
          onReply={() => onReply(t.id, t.handle)}
          repostedByMe={false}
          likesCount={t.likes}
          repostsCount={t.reposts}
          likedByMe={t.liked}
          onDelete={() => onDelete(t.id)}
        />
      ))}
      {echoes.length === 0 && (
        <div className="px-6 py-12 text-center text-white/60">Nothing here yet.</div>
      )}
    </div>
  );
}
