import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
  // Mark setup as done and continue; name/image come from the session
  cookieStore.set("echo_setup", "done", { path: "/" });
  // Optionally persist derived handle/name if needed later
  if (session?.user?.name) cookieStore.set("echo_name", encodeURIComponent(session.user.name), { path: "/" });
  redirect("/");
}
