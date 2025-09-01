import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import EchoThread from "@/components/EchoThread";
import { prisma } from "@/lib/db";

export default async function EchoPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    const path = `/echo/${encodeURIComponent(p.id)}`;
    redirect(`/?callbackUrl=${encodeURIComponent(path)}`);
  }
  // Normalize to root echo: if the id is a reply, follow the chain up to the top-level echo
  try {
    const current = await prisma.echo.findUnique({ where: { id: p.id }, select: { id: true, replyToId: true } });
    if (current) {
      let rootId: string = current.id;
      let cur: string | null = current.replyToId as string | null;
      let hops = 0;
      while (cur && hops < 20) {
        rootId = cur;
        const parent = await prisma.echo.findUnique({ where: { id: cur }, select: { id: true, replyToId: true } });
        if (!parent) break;
        cur = (parent.replyToId as string | null) ?? null;
        hops++;
      }
      if (rootId !== p.id) redirect(`/echo/${encodeURIComponent(rootId)}`);
    }
  } catch {}
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
