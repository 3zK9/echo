"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import Compose from "@/components/Compose";
import TweetItem, { type Tweet } from "@/components/Tweet";
import { useTweets } from "@/state/tweets";
import { useToast } from "@/components/Toast";

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
  const { tweets, addTweet, toggleLike, addRetweet, removeRetweet, hasRetweetBy, incRetweets, decRetweets } = useTweets();
  const { data: session } = useSession();
  const { show } = useToast();
  const [composePrefill, setComposePrefill] = useState<string>("");

  const add = (text: string) => {
    const name = session?.user?.name || "You";
    const avatarUrl = session?.user?.image || undefined;
    const handle = session?.user?.username || (name || "you").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "you";
    const t: Omit<Tweet, "id"> = {
      name,
      handle,
      time: "now",
      text,
      likes: 0,
      retweets: 0,
      liked: false,
      retweeted: false,
      avatarUrl,
    };
    addTweet(t);
  };

  const displayed = tweets.filter((t) => {
    if (filter === "likes") return !!t.liked;
    if (filter === "mine") {
      if (!mineUsername) return false;
      return t.handle?.toLowerCase() === mineUsername.toLowerCase();
    }
    return true;
  });

  const onRetweet = (id: string) => {
    const name = session?.user?.name || "You";
    const avatarUrl = session?.user?.image || undefined;
    const handle = session?.user?.username || (name || "you").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "you";
    const target = tweets.find((t) => t.id === id);
    if (!target) return;
    const baseId = target.originalId ?? target.id;
    const original = tweets.find((t) => t.id === baseId);
    if (!original) return;

    const already = hasRetweetBy(baseId, handle);
    if (already) {
      removeRetweet(baseId, handle);
      decRetweets(baseId);
    } else {
      addRetweet(original, { name, handle, avatarUrl });
      incRetweets(baseId);
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
          const retweetedByMe = hasRetweetBy(baseId, me);
          const base = tweets.find((x) => x.id === baseId) || t;
          const likeHandler = () => toggleLike(baseId);
          const retweetHandler = () => onRetweet(baseId);
          const shareHandler = () => onShare(baseId);
          const replyHandler = () => {
            setComposePrefill(`@${base.handle} `);
            if (window.location.hash !== "#compose") window.location.hash = "compose";
          };
          return (
            <TweetItem
              key={t.id}
              t={t}
              onLike={likeHandler}
              onRetweet={retweetHandler}
              onShare={shareHandler}
              onReply={replyHandler}
              retweetedByMe={retweetedByMe}
              likesCount={base.likes}
              retweetsCount={base.retweets}
              likedByMe={base.liked}
            />
          );
        })}
      </div>
    </section>
  );
}
