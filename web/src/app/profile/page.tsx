import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const me = session?.user?.username || (session?.user?.name ? session.user.name.toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) : "echo-user");
  redirect(`/profile/${encodeURIComponent(me)}`);
}
