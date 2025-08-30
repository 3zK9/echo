import Sidebar from "@/components/Sidebar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import ProfileView from "@/components/ProfileView";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

function sanitizeHandle(name?: string) {
  return (name || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "user";
}

//

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

  // Fetch lightweight profile meta (bio/link) on server to avoid client delay
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
          <ProfileView username={username} displayName={displayName} avatar={avatar} canEdit={isMe} initialTab={tab} initialBio={initialBio} initialLink={initialLink} />
        </section>
      </main>
    </div>
  );
}
