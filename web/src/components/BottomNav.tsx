"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { HomeIcon, UserIcon, PlusIcon } from "@/components/icons";

export default function BottomNav() {
  const { data: session } = useSession();
  const username = (session?.user as any)?.username as string | undefined;

  // Hide on unauthenticated/splash
  if (!session) return null;

  const onCompose = () => {
    if (typeof window !== "undefined") {
      window.location.hash = "compose";
      // Some pages listen for #compose to focus the textarea
    }
  };

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-black/60 backdrop-blur border-t border-white/10"
      role="navigation"
      aria-label="Primary"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-3xl mx-auto px-6 py-2 flex items-center justify-between">
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
        <Link
          href={username ? `/profile/${encodeURIComponent(username)}` : "/profile"}
          className="p-2 rounded-full hover:bg-white/10"
          aria-label="Profile"
        >
          <UserIcon className="w-7 h-7" />
        </Link>
      </div>
    </nav>
  );
}

