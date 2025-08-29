"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

type ProfilesMap = Record<string, { bio?: string }>;

type ProfileContextType = {
  getBio: (username: string) => string;
  setBio: (username: string, bio: string) => void;
};

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<ProfilesMap>({});
  const STORAGE_KEY = "echo_profiles_v1";

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as ProfilesMap;
        if (parsed && typeof parsed === "object") setProfiles(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch {}
  }, [profiles]);

  const getBio = useCallback((username: string) => {
    const key = (username || "").toLowerCase();
    return profiles[key]?.bio || "";
  }, [profiles]);

  const setBio = useCallback((username: string, bio: string) => {
    const key = (username || "").toLowerCase();
    setProfiles((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), bio } }));
  }, []);

  const value = useMemo(() => ({ getBio, setBio }), [getBio, setBio]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

