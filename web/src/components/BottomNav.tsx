"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { HomeIcon, UserIcon, PlusIcon, LogoutIcon } from "@/components/icons";
import { useConfirm } from "@/components/Confirm";

export default function BottomNav() {
  const { data: session } = useSession();
  const username = (session?.user as any)?.username as string | undefined;
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showNav = !!session;

  const onCompose = () => {
    if (typeof window !== "undefined") {
      try {
        const { pathname, search } = window.location;
        if (pathname !== "/") {
          const qs = search && search.length > 0 ? search : "";
          window.location.href = `/${qs}#compose`;
        } else {
          window.location.hash = "compose";
        }
      } catch {
        window.location.href = "/#compose";
      }
    }
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return showNav ? (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-black/60 backdrop-blur border-t border-white/10"
      role="navigation"
      aria-label="Primary"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-3xl mx-auto px-6 py-2 flex items-center justify-between gap-4">
        <Link href="/" className="p-2 rounded-full hover:bg-white/10" aria-label="Home">
          <HomeIcon className="w-7 h-7" />
        </Link>
        <button
          type="button"
          onClick={onCompose}
          className="-mt-8 bg-gradient-to-r from-violet-500 to-sky-500 text-white rounded-full p-4 shadow-lg shadow-black/40"
          aria-label="Compose Echo"
        >
          <PlusIcon className="w-6 h-6" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-full hover:bg-white/10"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Profile menu"
            title="Profile menu"
          >
            <UserIcon className="w-7 h-7" />
          </button>
          {open && (
            <div role="menu" aria-label="Profile menu" className="absolute bottom-12 right-0 w-44 panel p-2">
              <Link
                href={username ? `/profile/${encodeURIComponent(username)}` : "/profile"}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <UserIcon className="w-5 h-5" />
                <span>Profile</span>
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-red-400"
                role="menuitem"
                onClick={async () => {
                  const ok = await confirm("Sign out?", { title: "Confirm", confirmText: "Sign out", cancelText: "Cancel" });
                  if (ok) signOut({ callbackUrl: "/" });
                }}
              >
                <LogoutIcon className="w-5 h-5" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  ) : null;
}
