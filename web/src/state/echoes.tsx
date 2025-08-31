"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import type { Echo } from "@/components/Echo";

type EchoesContextType = {
  echoes: Echo[];
  addEcho: (t: Omit<Echo, "id">) => void;
  toggleLike: (id: string) => void;
  toggleRepost: (id: string) => void;
  addRepost: (original: Echo, by: { name: string; handle: string; avatarUrl?: string }) => void;
  removeRepost: (originalId: string, handle: string) => void;
  hasRepostBy: (originalId: string, handle: string) => boolean;
  incReposts: (originalId: string) => void;
  decReposts: (originalId: string) => void;
  deleteEcho: (id: string) => Promise<boolean>;
};

const EchoesContext = createContext<EchoesContextType | undefined>(undefined);

export function EchoesProvider({ children }: { children: React.ReactNode }) {
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const STORAGE_KEY = "echo_feed_v1";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/echoes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Echo[];
      setEchoes(data);
    } catch {}
  }, []);

  useEffect(() => {
    // Show cached feed immediately if present
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Echo[];
        if (Array.isArray(parsed)) setEchoes(parsed);
      }
    } catch {}
    refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(echoes));
    } catch {}
  }, [echoes]);

  const addEcho: EchoesContextType["addEcho"] = async (t) => {
    // Optimistic insert with temp id
    const tempId = `temp_${Math.random().toString(36).slice(2)}`;
    const optimistic: Echo = {
      id: tempId,
      name: t.name,
      handle: t.handle,
      time: "now",
      text: t.text,
      likes: 0,
      reposts: 0,
      liked: false,
      reposted: false,
      avatarUrl: t.avatarUrl,
    };
    setEchoes((prev) => [optimistic, ...prev]);
    try {
      const res = await fetch("/api/echoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t.text, originalId: t.originalId }) });
      if (!res.ok) throw new Error("create_failed");
      const created = (await res.json()) as Echo;
      setEchoes((prev) => prev.map((e) => (e.id === tempId ? created : e)));
    } catch {
      // rollback
      setEchoes((prev) => prev.filter((e) => e.id !== tempId));
    }
  };

  const toggleLike = async (id: string) => {
    // Optimistic flip
    let rollback: Echo | null = null;
    setEchoes((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      rollback = t;
      const liked = !t.liked;
      const likes = Math.max(0, (t.likes || 0) + (liked ? 1 : -1));
      return { ...t, liked, likes };
    }));
    try {
      const res = await fetch(`/api/echoes/${id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("like_failed");
      const { likes, liked } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === id ? { ...t, liked, likes } : t)));
    } catch {
      // rollback
      if (rollback) setEchoes((prev) => prev.map((t) => (t.id === id ? rollback! : t)));
    }
  };

  const toggleRepost = async (id: string) => {
    // Optimistic flip
    let rollback: Echo | null = null;
    setEchoes((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      rollback = t;
      const reposted = !t.reposted;
      const reposts = Math.max(0, (t.reposts || 0) + (reposted ? 1 : -1));
      return { ...t, reposted, reposts };
    }));
    try {
      const res = await fetch(`/api/echoes/${id}/repost`, { method: "POST" });
      if (!res.ok) throw new Error("repost_failed");
      const { reposts, reposted } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === id ? { ...t, reposted, reposts } : t)));
    } catch {
      if (rollback) setEchoes((prev) => prev.map((t) => (t.id === id ? rollback! : t)));
    }
  };

  const addRepost: EchoesContextType["addRepost"] = async (original, by) => {
    // Optimistically add a repost item to the top
    const tempId = `re_${original.id}_${Math.random().toString(36).slice(2)}`;
    const repost: Echo = {
      id: tempId,
      name: by.name,
      handle: by.handle,
      time: "now",
      text: "",
      likes: original.likes,
      reposts: (original.reposts || 0) + 1,
      liked: original.liked,
      reposted: true,
      avatarUrl: by.avatarUrl,
      originalId: original.id,
      isRepost: true,
      canDelete: false,
    };
    setEchoes((prev) => [repost, ...prev.map((t) => (t.id === original.id ? { ...t, reposted: true, reposts: (t.reposts || 0) + 1 } : t))]);
    try {
      const res = await fetch(`/api/echoes/${original.id}/repost`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { reposts, reposted } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === original.id ? { ...t, reposted, reposts } : t)));
    } catch {
      // rollback
      setEchoes((prev) => prev.filter((t) => t.id !== tempId).map((t) => (t.id === original.id ? { ...t, reposted: false, reposts: Math.max(0, (t.reposts || 0) - 1) } : t)));
    }
  };

  const removeRepost: EchoesContextType["removeRepost"] = async (originalId, handle) => {
    // Optimistically remove my repost item and update counts
    setEchoes((prev) => prev.filter((t) => !(t.originalId === originalId && t.handle === handle)).map((t) => (t.id === originalId ? { ...t, reposted: false, reposts: Math.max(0, (t.reposts || 0) - 1) } : t)));
    try {
      const res = await fetch(`/api/echoes/${originalId}/repost`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { reposts, reposted } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === originalId ? { ...t, reposted, reposts } : t)));
    } catch {
      // rollback: can't reconstruct removed temp repost reliably; refresh feed
      refresh();
    }
  };

  const hasRepostBy: EchoesContextType["hasRepostBy"] = (originalId, handle) => {
    return echoes.some((t) => t.originalId === originalId && t.handle === handle);
  };

  const incReposts: EchoesContextType["incReposts"] = async () => {};

  const decReposts: EchoesContextType["decReposts"] = async () => {};

  const deleteEcho = async (id: string) => {
    try {
      const res = await fetch(`/api/echoes/${id}`, { method: "DELETE" });
      if (!res.ok) return false;
      // Remove the original and any repost items that reference it
      setEchoes((prev) => prev.filter((t) => t.id !== id && t.originalId !== id));
      return true;
    } catch {
      return false;
    }
  };

  const value = useMemo(
    () => ({ echoes, addEcho, toggleLike, toggleRepost, addRepost, removeRepost, hasRepostBy, incReposts, decReposts, deleteEcho }),
    [echoes, removeRepost, hasRepostBy]
  );
  return <EchoesContext.Provider value={value}>{children}</EchoesContext.Provider>;
}

export function useEchoes() {
  const ctx = useContext(EchoesContext);
  if (!ctx) throw new Error("useEchoes must be used within EchoesProvider");
  return ctx;
}
