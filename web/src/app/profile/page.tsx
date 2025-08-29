import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const me = session?.user?.username || "echo-user";
  redirect(`/profile/${encodeURIComponent(me)}`);
}
