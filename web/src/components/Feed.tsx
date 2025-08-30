"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import Compose from "@/components/Compose";
import EchoItem, { type Echo } from "@/components/Echo";
import { useEchoes } from "@/state/echoes";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";

export default function Feed({
  title = "Home",
  showCompose = true,
  filter = "all",
  mineUsername,
  emptyMessage,
}: {
  title?: string;
  showCompose?: boolean;
  filter?: "all" | "likes" | "mine";
  mineUsername?: string;
  emptyMessage?: string;
}) {
  const { echoes, addEcho, toggleLike, addRepost, removeRepost, hasRepostBy, incReposts, decReposts, deleteEcho } = useEchoes();
  const { data: session } = useSession();
  const { show } = useToast();
  const confirm = useConfirm();
  const [composePrefill, setComposePrefill] = useState<string>("");

  const add = (text: string) => {
    const name = session?.user?.name || "You";
    const avatarUrl = session?.user?.image || undefined;
    const handle = session?.user?.username || (name || "you").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "you";
    const t: Omit<Echo, "id"> = {
      name,
      handle,
      time: "now",
      text,
      likes: 0,
      reposts: 0,
      liked: false,
      reposted: false,
      avatarUrl,
    };
    addEcho(t);
  };

  const meUsername = (typeof session?.user?.username === "string" ? session.user.username : undefined);
  const meName = (typeof session?.user?.name === "string" ? session.user.name : undefined);
  const meFallback = meName ? meName.toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) : undefined;

  const displayed = echoes.filter((t) => {
    if (filter === "likes") return !!t.liked;
    if (filter === "mine") {
      if (!mineUsername) return false;
      // If viewing our own profile, also include historical local echoes that used fallbacks like "you" or sanitized name
      const viewingOwn = meUsername && meUsername.toLowerCase() === mineUsername.toLowerCase();
      if (viewingOwn) {
        const candidates = new Set([
          mineUsername.toLowerCase(),
          "you",
          meFallback || "",
        ].filter(Boolean));
        return candidates.has((t.handle || "").toLowerCase());
      }
      // Otherwise strict match to the target username
      return (t.handle || "").toLowerCase() === mineUsername.toLowerCase();
    }
    return true;
  });

  const onRepost = (id: string) => {
    const name = session?.user?.name || "You";
    const avatarUrl = session?.user?.image || undefined;
    const handle = session?.user?.username || (name || "you").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "you";
    const target = echoes.find((t) => t.id === id);
    if (!target) return;
    const baseId = target.originalId ?? target.id;
    const original = echoes.find((t) => t.id === baseId);
    if (!original) return;

    const already = hasRepostBy(baseId, handle);
    if (already) {
      removeRepost(baseId, handle);
      decReposts(baseId);
    } else {
      addRepost(original, { name, handle, avatarUrl });
      incReposts(baseId);
    }
  };

  const onShare = async (id: string) => {
    const { origin, pathname } = window.location;
    const url = `${origin}${pathname}#t-${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: "Echo", text: "Check out this echo" });
      } else {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const el = document.createElement("textarea");
          el.value = url;
          el.setAttribute("readonly", "");
          el.style.position = "absolute";
          el.style.left = "-9999px";
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
        }
        show("Link copied to clipboard");
      }
    } catch (e) {
      // ignore user cancel
    }
  };

  const onDelete = async (id: string) => {
    const okConfirm = await confirm("Delete this echo?", { title: "Delete Echo", confirmText: "Delete" });
    if (!okConfirm) return;
    const ok = await deleteEcho(id);
    show(ok ? "Echo deleted" : "Failed to delete echo");
  };

  return (
    <section className="max-w-[680px] mx-auto min-h-screen">
      <header className="panel px-4 py-3 text-xl font-bold sticky top-4 z-10">
        {title}
      </header>
      <div className="panel mt-4 overflow-hidden">
        {showCompose && <Compose onPost={add} initialText={composePrefill} />}
        {displayed.length === 0 && !showCompose && (
          <div className="px-6 py-12 text-center text-white/60">{emptyMessage || "Nothing here yet."}</div>
        )}
        {displayed.map((t) => {
          const baseId = t.originalId ?? t.id;
          const me = session?.user?.username || "you";
          const repostedByMe = hasRepostBy(baseId, me);
          const base = echoes.find((x) => x.id === baseId) || t;
          const likeHandler = () => toggleLike(baseId);
          const repostHandler = () => onRepost(baseId);
          const shareHandler = () => onShare(baseId);
          const replyHandler = () => {
            setComposePrefill(`@${base.handle} `);
            if (window.location.hash !== "#compose") window.location.hash = "compose";
          };
          return (
            <EchoItem
              key={t.id}
              t={t}
              onLike={likeHandler}
              onRepost={repostHandler}
              onShare={shareHandler}
              onReply={replyHandler}
              repostedByMe={repostedByMe}
              likesCount={base.likes}
              repostsCount={base.reposts}
              likedByMe={base.liked}
              onDelete={onDelete}
            />
          );
        })}
      </div>
    </section>
  );
}
