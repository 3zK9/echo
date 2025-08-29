import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import Splash from "@/components/Splash";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) return <Splash />;
  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[275px_minmax(0,1fr)] min-h-screen gap-4 p-4 md:p-6">
      <aside className="hidden md:block px-0">
        <Sidebar />
      </aside>
      <main>
        <Feed />
      </main>
    </div>
  );
}
