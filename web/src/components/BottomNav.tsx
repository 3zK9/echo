"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { HomeIcon, UserIcon, PlusIcon, LogoutIcon, MessageIcon } from "@/components/icons";
import { useConfirm } from "@/components/Confirm";

export default function BottomNav() {
  const { data: session } = useSession();
  const username = (session?.user as any)?.username as string | undefined;
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showNav = !!session;

  const onCompose = () => {
    if (typeof window !== "undefined") {
      try {
        const { pathname } = window.location;
        if (pathname.startsWith('/profile')) {
          const m = pathname.match(/^\/profile\/([^\/?#]+)/);
          const handle = (m && m[1]) ? m[1] : (username || '');
          if (handle) {
            window.location.href = `/?mention=${encodeURIComponent(handle)}#compose`;
            return;
          }
        }
        if (pathname !== "/") {
          window.location.href = "/#compose";
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
        {( !(pathname && pathname.startsWith("/profile")) ) && (
          <button
            type="button"
          onClick={onCompose}
          className="-mt-8 bg-gradient-to-r from-violet-500 to-sky-500 text-white rounded-full p-4 shadow-lg shadow-black/40"
            aria-label="Compose Echo"
          >
            <PlusIcon className="w-6 h-6" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="p-2 rounded-full opacity-60 cursor-not-allowed flex items-center gap-1"
            aria-label="Messages (coming soon)"
          >
            <MessageIcon className="w-7 h-7" />
            <span className="ml-1 px-1.5 py-0.5 text-[10px] leading-none rounded-full border border-white/20 text-white/70">soon</span>
          </button>
        </div>
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
