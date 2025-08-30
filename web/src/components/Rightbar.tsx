export default function Rightbar() {
  return (
    <div className="sticky top-0 space-y-4">
      <div className="pt-2">
        <input
          type="text"
          placeholder="Search Echo"
          className="w-full rounded-full px-4 py-2 bg-black/5 dark:bg-white/10 outline-none"
        />
      </div>

      <section className="rounded-2xl bg-black/5 dark:bg-white/10 overflow-hidden">
        <h3 className="px-4 py-3 font-bold text-lg">Trends for you</h3>
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {[
            { topic: "#NextJS", count: "12.3K Posts" },
            { topic: "#TypeScript", count: "8,412 Posts" },
            { topic: "#TailwindCSS", count: "5,201 Posts" },
          ].map((t) => (
            <li key={t.topic} className="px-4 py-3">
              <div className="text-sm text-black/50 dark:text-white/60">Trending in Tech</div>
              <div className="font-semibold">{t.topic}</div>
              <div className="text-sm text-black/50 dark:text-white/60">{t.count}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
