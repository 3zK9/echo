"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useProfile } from "@/state/profile";

async function saveBioServer(bio: string) {
  const res = await fetch("/api/profile/bio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio }) });
  return res.ok;
}

const MAX_BIO = 280;

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
  const { getBio, setBio, getLink, setLink } = useProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(getBio(username).slice(0, MAX_BIO));
  const bio = getBio(username);
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string>(getLink(username) || "");
  const link = getLink(username);

  const onSave = async () => {
    const trimmed = draft.trim();
    setBio(username, trimmed);
    setEditing(false);
    try { await saveBioServer(trimmed); } catch {}
  };

  function normalizeUrl(raw: string): string | null {
    const val = String(raw || "").trim().slice(0, 200);
    if (!val) return null;
    const prefixed = /^(https?:)?\/\//i.test(val) ? val : `https://${val}`;
    try {
      const u = new URL(prefixed);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  const onSaveLink = async () => {
    const normalized = normalizeUrl(linkDraft);
    setLink(username, normalized);
    setEditingLink(false);
    try {
      await fetch("/api/profile/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: normalized }),
      });
    } catch {}
  };

  const nearLimit = draft.length >= MAX_BIO - 40 && draft.length < MAX_BIO;
  const atLimit = draft.length >= MAX_BIO;
  const counterClass = atLimit
    ? "text-red-500 font-semibold"
    : nearLimit
      ? "text-amber-400"
      : "text-white/50";

  // Sync from server when viewing a profile, to populate local cache
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(username)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data?.bio === "string") setBio(username, data.bio);
        if (typeof data?.link === "string" || data?.link === null) setLink(username, data.link ?? null);
        setDraft((data?.bio || "").slice(0, MAX_BIO));
        setLinkDraft(data?.link || "");
      } catch {}
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  return (
    <div className="px-4 py-3 sticky top-0 backdrop-blur bg-white/70 dark:bg-black/50 border-b border-black/10 dark:border-white/10">
      <div className="flex items-start gap-3">
        <Image src={avatar} alt="avatar" width={48} height={48} className="rounded-full" priority sizes="48px" />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold leading-tight truncate">{displayName}</div>
          <div className="text-sm text-black/60 dark:text-white/60 truncate">@{username}</div>
          <div className="mt-2">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_BIO))}
                  rows={3}
                  maxLength={MAX_BIO}
                  className="w-full rounded-md bg-black/5 dark:bg-white/10 p-2 outline-none resize-none max-h-48 overflow-auto break-words break-all"
                  style={{ overflowWrap: "anywhere" }}
                  placeholder="Write a short bio..."
                />
                <div className="flex items-center justify-between">
                  <div className={`text-xs ${counterClass}`} aria-live="polite">{draft.length}/{MAX_BIO}</div>
                  <div className="flex gap-2">
                    <button onClick={onSave} className="btn-primary px-4 py-2">Save</button>
                    <button
                      onClick={() => {
                        setDraft(bio.slice(0, MAX_BIO));
                        setEditing(false);
                      }}
                      className="px-4 py-2 rounded-full border border-white/10 hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 min-w-0">
                <p className="text-sm text-white/80 whitespace-pre-wrap break-words break-all flex-1 overflow-hidden">
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

            {/* Link section */}
            <div className="mt-3">
              {editingLink ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    inputMode="url"
                    value={linkDraft}
                    onChange={(e) => setLinkDraft(e.target.value.slice(0, 200))}
                    placeholder="Add a link (https://example.com)"
                    className="w-full rounded-md bg-black/5 dark:bg-white/10 p-2 outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <div className="text-xs">
                      {linkDraft && !normalizeUrl(linkDraft) ? (
                        <span className="text-red-500">Enter a valid URL (http/https)</span>
                      ) : (
                        <span className="text-white/50">One link max</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={onSaveLink} className="btn-primary px-4 py-2 disabled:opacity-60" disabled={Boolean(linkDraft) && !normalizeUrl(linkDraft)}>Save</button>
                      <button
                        onClick={() => { setLinkDraft(link || ""); setEditingLink(false); }}
                        className="px-4 py-2 rounded-full border border-white/10 hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    {link ? (
                      <a
                        href={normalizeUrl(link) || undefined}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-sky-400 hover:underline break-all"
                      >
                        {link}
                      </a>
                    ) : (
                      <div className="text-sm text-white/60">{canEdit ? "Add a link" : ""}</div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setEditingLink(true)}
                      className="shrink-0 px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/10 text-sm font-semibold"
                    >
                      {link ? "Edit" : "Add"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
