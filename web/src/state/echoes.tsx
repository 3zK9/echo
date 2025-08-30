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
  deleteEcho: (id: string) => void;
};

const EchoesContext = createContext<EchoesContextType | undefined>(undefined);

export function EchoesProvider({ children }: { children: React.ReactNode }) {
  const [echoes, setEchoes] = useState<Echo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/echoes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Echo[];
      setEchoes(data);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEcho: EchoesContextType["addEcho"] = async (t) => {
    try {
      const res = await fetch("/api/echoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t.text, originalId: t.originalId }) });
      if (!res.ok) return;
      const created = (await res.json()) as Echo;
      setEchoes((prev) => [created, ...prev]);
    } catch {}
  };

  const toggleLike = async (id: string) => {
    try {
      const res = await fetch(`/api/echoes/${id}/like`, { method: "POST" });
      if (!res.ok) return;
      const { likes, liked } = await res.json();
      setEchoes((prev) => prev.map((t) => (t.id === id ? { ...t, liked, likes } : t)));
    } catch {}
  };

  const toggleRepost = async (id: string) => {
    try {
      const res = await fetch(`/api/echoes/${id}/repost`, { method: "POST" });
      if (!res.ok) return;
      await refresh();
    } catch {}
  };

  const addRepost: EchoesContextType["addRepost"] = async (original) => {
    await toggleRepost(original.id);
  };

  const removeRepost: EchoesContextType["removeRepost"] = async (originalId) => {
    await toggleRepost(originalId);
  };

  const hasRepostBy: EchoesContextType["hasRepostBy"] = (originalId, handle) => {
    return echoes.some((t) => t.originalId === originalId && t.handle === handle);
  };

  const incReposts: EchoesContextType["incReposts"] = async () => {};

  const decReposts: EchoesContextType["decReposts"] = async () => {};

  const deleteEcho = async (id: string) => {
    try {
      const res = await fetch(`/api/echoes/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setEchoes((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  };

  const value = useMemo(
    () => ({ echoes, addEcho, toggleLike, toggleRepost, addRepost, removeRepost, hasRepostBy, incReposts, decReposts, deleteEcho }),
    [echoes]
  );
  return <EchoesContext.Provider value={value}>{children}</EchoesContext.Provider>;
}

export function useEchoes() {
  const ctx = useContext(EchoesContext);
  if (!ctx) throw new Error("useEchoes must be used within EchoesProvider");
  return ctx;
}
