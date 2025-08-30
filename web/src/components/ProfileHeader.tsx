"use client";

import Image from "next/image";
import { useState } from "react";
import { useProfile } from "@/state/profile";

async function saveBioServer(bio: string) {
  const res = await fetch("/api/profile/bio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio }) });
  return res.ok;
}

export default function ProfileHeader({
  username,
  displayName,
  avatar,
  canEdit,
}: {
  username: string;
  displayName: string;
  avatar: string;
  canEdit: boolean;
}) {
  const { getBio, setBio } = useProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(getBio(username));
  const bio = getBio(username);

  const onSave = async () => {
    const trimmed = draft.trim();
    setBio(username, trimmed);
    setEditing(false);
    try { await saveBioServer(trimmed); } catch {}
  };

  return (
    <div className="px-4 py-3 sticky top-0 backdrop-blur bg-white/70 dark:bg-black/50 border-b border-black/10 dark:border-white/10">
      <div className="flex items-start gap-3">
        <Image src={avatar} alt="avatar" width={48} height={48} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold leading-tight truncate">{displayName}</div>
          <div className="text-sm text-black/60 dark:text-white/60 truncate">@{username}</div>
          <div className="mt-2">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-md bg-black/5 dark:bg-white/10 p-2 outline-none"
                  placeholder="Write a short bio..."
                />
                <div className="flex gap-2">
                  <button onClick={onSave} className="btn-primary px-4 py-2">Save</button>
                  <button
                    onClick={() => {
                      setDraft(bio);
                      setEditing(false);
                    }}
                    className="px-4 py-2 rounded-full border border-white/10 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <p className="text-sm text-white/80 whitespace-pre-wrap break-words flex-1">
                  {bio || (canEdit ? "Add your bio" : "")}
                </p>
                {canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    className="shrink-0 px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/10 text-sm font-semibold"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
