import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import ProfileHeader from "@/components/ProfileHeader";
import { redirect } from "next/navigation";

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (sp?.tab === "likes" ? "likes" : "echoes") as "echoes" | "likes";
  const session = await getServerSession(authOptions);
  if (!session) {
    const p = await params;
    const path = `/profile/${encodeURIComponent(p.user)}`;
    const qs = sp?.tab ? `?tab=${encodeURIComponent(sp.tab)}` : "";
    const callbackUrl = `${path}${qs}`;
    redirect(`/?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  const p = await params;
  const username = decodeURIComponent(p.user);
  const isMe = !!session?.user?.username && session.user.username.toLowerCase() === username.toLowerCase();
  const displayName = isMe ? (session?.user?.name || username) : username;
  const avatar = isMe
    ? (session?.user?.image || `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent(username.toLowerCase())}`)
    : `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent(username.toLowerCase())}`;

  const makeHref = (t: "echoes" | "likes") => {
    const sp = new URLSearchParams();
    sp.set("tab", t);
    return `/profile/${encodeURIComponent(username)}?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[275px_minmax(0,1fr)] min-h-screen">
      <aside className="hidden md:block border-r border-black/10 dark:border-white/10 px-4 py-2">
        <Sidebar />
      </aside>
      <main>
        <section className="max-w-[600px] border-x border-black/10 dark:border-white/10 min-h-screen">
          <ProfileHeader username={username} displayName={displayName} avatar={avatar} canEdit={isMe} />

          <div className="sticky top-[53px] z-10 bg-white/70 dark:bg-black/50 backdrop-blur border-b border-black/10 dark:border-white/10">
            <div className="flex">
              <Link
                href={makeHref("echoes")}
                className={`flex-1 text-center px-4 py-3 font-semibold hover:bg-black/5 dark:hover:bg-white/10 ${
                  tab === "echoes" ? "border-b-2 border-sky-500" : ""
                }`}
              >
                Echoes
              </Link>
              <Link
                href={makeHref("likes")}
                className={`flex-1 text-center px-4 py-3 font-semibold hover:bg-black/5 dark:hover:bg-white/10 ${
                  tab === "likes" ? "border-b-2 border-sky-500" : ""
                }`}
              >
                Likes
              </Link>
            </div>
          </div>

          {tab === "echoes" ? (
            <Feed title="Echoes" showCompose={false} filter="mine" mineUsername={username} emptyMessage={`@${username} hasn't echoed yet.`} />
          ) : (
            <Feed title="Likes" showCompose={false} filter="likes" emptyMessage={`@${username} hasn't liked anything yet.`} />
          )}
        </section>
      </main>
    </div>
  );
}
