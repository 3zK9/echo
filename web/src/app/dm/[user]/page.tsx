import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import DMChat from "@/components/DMChat";

export default async function DMPage({ params }: { params: Promise<{ user: string }> }) {
  const p = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/?callbackUrl=${encodeURIComponent(`/dm/${encodeURIComponent(p.user)}`)}`);
  const peer = decodeURIComponent(p.user);
  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[275px_minmax(0,1fr)] min-h-screen">
      <aside className="hidden md:block border-r border-black/10 dark:border-white/10 px-4 py-2">
        <Sidebar />
      </aside>
      <main>
        <section className="max-w-[600px] border-x border-black/10 dark:border-white/10 min-h-screen p-4">
          <DMChat peer={peer} />
        </section>
      </main>
    </div>
  );
}
