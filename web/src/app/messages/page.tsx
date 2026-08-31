import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import MessagesLobby from "@/components/p2p/MessagesLobby";
import MessagesPageShell, { MessagesUnavailable } from "@/components/p2p/MessagesPageShell";
import { isP2PMessagingEnabled } from "@/lib/p2p/config";

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/?callbackUrl=%2Fmessages");

  return (
    <MessagesPageShell>
      {isP2PMessagingEnabled() ? (
        <MessagesLobby
          userId={session.user.id}
          username={session.user.username || ""}
        />
      ) : <MessagesUnavailable />}
    </MessagesPageShell>
  );
}
