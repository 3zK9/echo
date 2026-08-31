import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import {
  loadAdminProductMetrics,
  type AdminProductMetrics,
  type ProductTotals,
} from "@/lib/metrics";
import { MetricsConfigurationError } from "@/lib/metrics-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function MetricCard({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <article className="panel p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">{label}</p>
      <p className="mt-3 text-3xl font-bold tabular-nums text-white">{integer.format(value)}</p>
      {note ? <p className="mt-1 text-sm text-white/45">{note}</p> : null}
    </article>
  );
}

function Totals({ totals }: { totals: ProductTotals }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Users" value={totals.users} />
      <MetricCard label="Active users" value={totals.activeUsers7d} note="Last 7 days" />
      <MetricCard label="Active users" value={totals.activeUsers30d} note="Last 30 days" />
      <MetricCard label="Original echoes" value={totals.originalEchoes} />
      <MetricCard label="Replies" value={totals.replies} />
      <MetricCard label="Reposts" value={totals.reposts} />
      <MetricCard label="Likes" value={totals.likes} />
    </div>
  );
}

function ActivityTable({ metrics }: { metrics: AdminProductMetrics }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="daily-activity-heading">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 id="daily-activity-heading" className="text-lg font-semibold">Daily activity</h2>
        <p className="mt-1 text-sm text-white/50">
          Aggregate counts only. No identities, content, messages, or credentials are collected.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">New users</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Active users</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Echoes</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Replies</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Reposts</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Likes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {metrics.daily.map((day) => (
              <tr key={day.date} className="text-white/75">
                <th scope="row" className="whitespace-nowrap px-5 py-3 font-medium text-white/85">
                  {day.date}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{integer.format(day.registeredUsers)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{integer.format(day.activeUsers)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{integer.format(day.originalEchoes)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{integer.format(day.replies)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{integer.format(day.reposts)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{integer.format(day.likes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function readMetrics(): Promise<AdminProductMetrics | null> {
  try {
    return await loadAdminProductMetrics();
  } catch (error) {
    const reason = error instanceof MetricsConfigurationError
      ? "read-only database connection is not configured"
      : "aggregate query failed";
    console.error(`Admin metrics unavailable: ${reason}`);
    return null;
  }
}

export default async function AdminPage() {
  noStore();
  await requireAdmin();
  const metrics = await readMetrics();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">Owner access</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Echo metrics</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Read-only product health from deliberately constrained aggregate database views.
          </p>
        </div>
        <Link href="/" className="text-sm font-semibold text-sky-300 hover:text-sky-200">
          Back to Echo
        </Link>
      </header>

      {metrics ? (
        <div className="space-y-6">
          <Totals totals={metrics.totals} />
          <ActivityTable metrics={metrics} />
          <p className="text-xs text-white/35">
            Generated {new Date(metrics.generatedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC
          </p>
        </div>
      ) : (
        <section className="panel border-amber-300/20 p-6" role="status">
          <h2 className="font-semibold text-amber-200">Metrics are unavailable</h2>
          <p className="mt-2 text-sm text-white/55">
            The dashboard did not fall back to the application&apos;s write-capable database connection.
            Check the server-side read-only metrics configuration.
          </p>
        </section>
      )}
    </main>
  );
}
