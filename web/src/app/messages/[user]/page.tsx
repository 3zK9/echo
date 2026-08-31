import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import LiveRoom from "@/components/p2p/LiveRoom";
import MessagesPageShell, { MessagesUnavailable } from "@/components/p2p/MessagesPageShell";
import { isP2PMessagingEnabled } from "@/lib/p2p/config";
import { normalizeGithubUsername } from "@/lib/p2p/protocol";
import { prisma } from "@/lib/db";

export default async function LiveMessagePage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const raw = (await params).user;
    redirect(`/?callbackUrl=${encodeURIComponent(`/messages/${encodeURIComponent(raw)}`)}`);
  }
  if (!isP2PMessagingEnabled()) {
    return <MessagesPageShell><MessagesUnavailable /></MessagesPageShell>;
  }

  let username: string;
  try {
    username = normalizeGithubUsername(decodeURIComponent((await params).user));
  } catch {
    notFound();
  }

  const peer = await prisma.user.findFirst({
    where: {
      id: { not: session.user.id },
      username: { equals: username, mode: "insensitive" },
    },
    select: { id: true, username: true, name: true },
  });
  if (!peer?.username) notFound();

  return (
    <MessagesPageShell>
      <LiveRoom
        selfUserId={session.user.id}
        peer={{
          userId: peer.id,
          username: peer.username,
          name: peer.name || peer.username,
        }}
      />
    </MessagesPageShell>
  );
}
