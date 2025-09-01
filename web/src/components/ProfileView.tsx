"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/ProfileHeader";
import ProfileFeed from "@/components/ProfileFeed";

export default function ProfileView({
  username,
  displayName,
  avatar,
  canEdit,
  initialTab = "echoes",
  initialBio,
  initialLink,
}: {
  username: string;
  displayName: string;
  avatar: string;
  canEdit: boolean;
  initialTab?: "echoes" | "likes" | "replies";
  initialBio?: string;
  initialLink?: string | null;
}) {
  const [tab, setTab] = useState<"echoes" | "likes" | "replies">(initialTab);

  useEffect(() => {
    // Initialize from URL if present
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (t === "likes" || t === "echoes" || t === "replies") setTab(t as any);
  }, []);

  const updateTab = (t: "echoes" | "likes") => {
    setTab(t);
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", t);
    const url = `/profile/${encodeURIComponent(username)}?${sp.toString()}`;
    // Update URL without triggering Next navigation to keep UI snappy
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <ProfileHeader username={username} displayName={displayName} avatar={avatar} canEdit={canEdit} initialBio={initialBio} initialLink={initialLink} />

      <div className="sticky top-[53px] z-10 panel">
        <div className="flex">
          <button
            onClick={() => updateTab("echoes")}
            className={`flex-1 text-center px-4 py-3 font-semibold hover:bg-white/10 ${
              tab === "echoes" ? "border-b-2 border-sky-500" : ""
            }`}
          >
            Echoes
          </button>
          <button
            onClick={() => updateTab("likes")}
            className={`flex-1 text-center px-4 py-3 font-semibold hover:bg-white/10 ${
              tab === "likes" ? "border-b-2 border-sky-500" : ""
            }`}
          >
            Likes
          </button>
          <button
            onClick={() => updateTab("replies")}
            className={`flex-1 text-center px-4 py-3 font-semibold hover:bg-white/10 ${
              tab === "replies" ? "border-b-2 border-sky-500" : ""
            }`}
          >
            Replies
          </button>
        </div>
      </div>

      <header className="px-4 py-3 text-xl font-bold sticky top-[109px] z-10 panel">{tab === "echoes" ? "Echoes" : tab === "likes" ? "Likes" : "Replies"}</header>
      <ProfileFeed key={`${username}:${tab}`} username={username} tab={tab} />
    </>
  );
}
