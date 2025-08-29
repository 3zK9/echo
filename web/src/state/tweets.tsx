"use client";

import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import type { Tweet } from "@/components/Tweet";

type TweetsContextType = {
  tweets: Tweet[];
  addTweet: (t: Omit<Tweet, "id">) => void;
  toggleLike: (id: string) => void;
  toggleRetweet: (id: string) => void;
  addRetweet: (original: Tweet, by: { name: string; handle: string; avatarUrl?: string }) => void;
  removeRetweet: (originalId: string, handle: string) => void;
  hasRetweetBy: (originalId: string, handle: string) => boolean;
  incRetweets: (originalId: string) => void;
  decRetweets: (originalId: string) => void;
};

const TweetsContext = createContext<TweetsContextType | undefined>(undefined);

export function TweetsProvider({ children }: { children: React.ReactNode }) {
  const [tweets, setTweets] = useState<Tweet[]>([]);

  // Persist to localStorage so state survives refresh during development
  const STORAGE_KEY = "echo_tweets_v1";

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Tweet[];
        if (Array.isArray(parsed)) setTweets(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(tweets));
    } catch {}
  }, [tweets]);

  const addTweet: TweetsContextType["addTweet"] = (t) => {
    const id = Math.random().toString(36).slice(2);
    setTweets((prev) => [{ id, ...t }, ...prev]);
  };

  const toggleLike = (id: string) => {
    setTweets((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, liked: !t.liked, likes: t.likes + (t.liked ? -1 : 1) } : t
      )
    );
  };

  const toggleRetweet = (id: string) => {
    setTweets((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, retweeted: !t.retweeted, retweets: t.retweets + (t.retweeted ? -1 : 1) }
          : t
      )
    );
  };

  const addRetweet: TweetsContextType["addRetweet"] = (original, by) => {
    const rt: Omit<Tweet, "id"> = {
      name: by.name,
      handle: by.handle,
      time: "now",
      text: original.text,
      likes: 0,
      retweets: 0,
      liked: false,
      retweeted: false,
      avatarUrl: by.avatarUrl,
      originalId: original.id,
      isRetweet: true,
    };
    addTweet(rt);
  };

  const removeRetweet: TweetsContextType["removeRetweet"] = (originalId, handle) => {
    setTweets((prev) => prev.filter((t) => !(t.originalId === originalId && t.handle === handle)));
  };

  const hasRetweetBy: TweetsContextType["hasRetweetBy"] = (originalId, handle) => {
    return tweets.some((t) => t.originalId === originalId && t.handle === handle);
  };

  const incRetweets: TweetsContextType["incRetweets"] = (originalId) => {
    setTweets((prev) => prev.map((t) => (t.id === originalId ? { ...t, retweets: t.retweets + 1 } : t)));
  };

  const decRetweets: TweetsContextType["decRetweets"] = (originalId) => {
    setTweets((prev) => prev.map((t) => (t.id === originalId ? { ...t, retweets: Math.max(0, t.retweets - 1) } : t)));
  };

  const value = useMemo(
    () => ({ tweets, addTweet, toggleLike, toggleRetweet, addRetweet, removeRetweet, hasRetweetBy, incRetweets, decRetweets }),
    [tweets]
  );
  return <TweetsContext.Provider value={value}>{children}</TweetsContext.Provider>;
}

export function useTweets() {
  const ctx = useContext(TweetsContext);
  if (!ctx) throw new Error("useTweets must be used within TweetsProvider");
  return ctx;
}
