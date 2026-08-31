import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";

export default function MessagesPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-screen max-w-5xl grid-cols-1 gap-4 p-4 md:grid-cols-[275px_minmax(0,1fr)] md:p-6">
      <aside className="hidden md:block">
        <Sidebar />
      </aside>
      <main className="mx-auto w-full max-w-[680px]">{children}</main>
    </div>
  );
}

export function MessagesUnavailable() {
  return (
    <section className="panel p-5">
      <h1 className="text-xl font-bold">Live messages unavailable</h1>
      <p className="mt-2 text-sm text-white/65">
        This proof is disabled until its matching database migration and production feature flag are enabled.
      </p>
    </section>
  );
}
