import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="panel w-full max-w-md p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">404</p>
        <h1 className="mt-3 text-2xl font-bold">This echo is gone</h1>
        <p className="mt-2 text-sm text-white/60">The page does not exist or is no longer available.</p>
        <Link href="/" className="btn-primary mt-6 inline-block px-5 py-2">
          Back to Echo
        </Link>
      </section>
    </main>
  );
}
