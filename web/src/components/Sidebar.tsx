"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { HomeIcon, UserIcon } from "@/components/icons";

const NavItem = ({ label, href, icon }: { label: string; href: string; icon?: React.ReactNode }) => (
  <Link
    href={href}
    className="flex items-center gap-3 px-4 py-3 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition"
  >
    <span className="text-xl" aria-hidden>
      {icon ?? "•"}
    </span>
    <span className="text-lg font-semibold">{label}</span>
  </Link>
);

export default function Sidebar() {
  const { data: session } = useSession();
  const user = session?.user;
  const username = user?.username;
  return (
    <div className="sticky top-4">
      <div className="panel p-4">
        <div className="text-2xl font-extrabold mb-4 bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">Echo</div>
        <nav className="flex flex-col gap-1">
          <NavItem label="Home" href="/" icon={<HomeIcon className="w-6 h-6" />} />
          <NavItem label="Profile" href={username ? `/profile/${encodeURIComponent(username)}` : "/profile"} icon={<UserIcon className="w-6 h-6" />} />
        </nav>
        <Link href="/#compose" className="mt-4 block text-center w-full btn-primary">Echo</Link>
        {user && (
          <div className="mt-6 flex items-center justify-between gap-3 p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <Image
                src={user.image || "https://api.dicebear.com/9.x/identicon/png?seed=echo"}
                alt="avatar"
                width={36}
                height={36}
                className="rounded-full"
              />
              <div className="truncate">
                <div className="font-semibold truncate">{user.name || "User"}</div>
                {username && (
                  <div className="text-xs text-black/60 dark:text-white/60 truncate">@{username}</div>
                )}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 border border-white/10"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
