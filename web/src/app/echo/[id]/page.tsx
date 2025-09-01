import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import EchoThread from "@/components/EchoThread";

export default async function EchoPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    const path = `/echo/${encodeURIComponent(p.id)}`;
    redirect(`/?callbackUrl=${encodeURIComponent(path)}`);
  }
  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[275px_minmax(0,1fr)] min-h-screen">
      <aside className="hidden md:block border-r border-black/10 dark:border-white/10 px-4 py-2">
        <Sidebar />
      </aside>
      <main>
        <section className="max-w-[600px] border-x border-black/10 dark:border-white/10 min-h-screen">
          <EchoThread echoId={p.id} />
        </section>
      </main>
    </div>
  );
}

