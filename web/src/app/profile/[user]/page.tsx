import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import ProfileHeader from "@/components/ProfileHeader";
import ProfileFeed from "@/components/ProfileFeed";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

function sanitizeHandle(name?: string) {
  return (name || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "user";
}

function relTime(d: Date) {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

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
  const unameLower = username.toLowerCase();
  const meUsername = (session?.user?.username || "").toLowerCase();
  const fallback = sanitizeHandle(session?.user?.name as string | undefined);
  const isMe = !!session && (
    (!!meUsername && meUsername === unameLower) ||
    (!!fallback && fallback === unameLower) ||
    unameLower === "you"
  );
  const displayName = isMe ? (session?.user?.name || username) : username;
  const avatar = isMe
    ? (session?.user?.image || `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent((meUsername || username).toLowerCase())}`)
    : `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent(username.toLowerCase())}`;

  const makeHref = (t: "echoes" | "likes") => {
    const sp = new URLSearchParams();
    sp.set("tab", t);
    return `/profile/${encodeURIComponent(username)}?${sp.toString()}`;
  };

  // Preload initial data server-side for snappier UX
  let initialEchoes = [] as any[];
  let initialLikes = [] as any[];
  let initialEchoCursor: string | null = null;
  let initialLikesOffset: number | null = null;
  try {
    const auth = await getServerSession(authOptions);
    const meId = (auth?.user as any)?.id as string | undefined;
    const u = await prisma.user.findFirst({ where: { username: username } });
    if (u) {
      const echos = await prisma.echo.findMany({ where: { authorId: u.id }, orderBy: { id: "desc" }, take: 21, include: { author: { select: { name: true, username: true, image: true } }, _count: { select: { likes: true, reposts: true } } } });
      const hasMoreE = echos.length > 20;
      const pageE = hasMoreE ? echos.slice(0, 20) : echos;
      initialEchoCursor = hasMoreE ? echos[20].id : null;
      initialEchoes = pageE.map((t) => ({
        id: t.id,
        name: t.author?.name || t.author?.username || "User",
        handle: t.author?.username || sanitizeHandle(t.author?.name || undefined),
        time: relTime(t.createdAt as Date),
        text: t.text,
        likes: t._count?.likes ?? 0,
        reposts: t._count?.reposts ?? 0,
        liked: false,
        reposted: false,
        avatarUrl: t.author?.image || undefined,
        originalId: t.originalId || undefined,
        isRepost: !!t.originalId,
        canDelete: !!meId && t.authorId === meId,
      }));
      const liked = await prisma.echoLike.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 20, include: { echo: { include: { author: { select: { name: true, username: true, image: true } }, _count: { select: { likes: true, reposts: true } } } } } });
      initialLikes = liked.map((l) => ({
        id: l.echo.id,
        name: l.echo.author?.name || l.echo.author?.username || "User",
        handle: l.echo.author?.username || sanitizeHandle(l.echo.author?.name || undefined),
        time: relTime(l.echo.createdAt as any as Date),
        text: l.echo.text,
        likes: l.echo._count?.likes ?? 0,
        reposts: l.echo._count?.reposts ?? 0,
        liked: true,
        reposted: false,
        avatarUrl: l.echo.author?.image || undefined,
        originalId: l.echo.originalId || undefined,
        isRepost: !!l.echo.originalId,
        canDelete: !!meId && l.echo.authorId === meId,
      }));
      initialLikesOffset = initialLikes.length === 20 ? 20 : null;
    }
  } catch {}

  // Load profile meta (bio/link) server-side to avoid extra client fetch
  let initialBio: string | undefined = undefined;
  let initialLink: string | null | undefined = undefined;
  try {
    const u = await prisma.user.findFirst({ where: { username: username } });
    if (u) {
      const prof = await prisma.profile.findUnique({ where: { userId: u.id } });
      initialBio = prof?.bio || "";
      initialLink = (prof?.link as string | null) ?? null;
    }
  } catch {}

  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[275px_minmax(0,1fr)] min-h-screen">
      <aside className="hidden md:block border-r border-black/10 dark:border-white/10 px-4 py-2">
        <Sidebar />
      </aside>
      <main>
        <section className="max-w-[600px] border-x border-black/10 dark:border-white/10 min-h-screen">
          <ProfileHeader username={username} displayName={displayName} avatar={avatar} canEdit={isMe} initialBio={initialBio} initialLink={initialLink} />

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

          <header className="px-4 py-3 text-xl font-bold sticky top-[109px] z-10 bg-white/70 dark:bg-black/50 backdrop-blur border-b border-black/10 dark:border-white/10">{tab === "echoes" ? "Echoes" : "Likes"}</header>
          <ProfileFeed key={`${username}:${tab}`} username={username} tab={tab} initialEchoes={initialEchoes} initialLikes={initialLikes} initialEchoCursor={initialEchoCursor} initialLikesOffset={initialLikesOffset} />
        </section>
      </main>
    </div>
  );
}
