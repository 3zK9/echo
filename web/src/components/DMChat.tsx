export default function DMChat({ peer }: { peer: string }) {
  return (
    <div className="panel p-3">
      <div className="text-lg font-semibold">Direct Messages with @{peer}</div>
      <p className="mt-2 text-sm text-white/60">
        Direct messages are currently unavailable.
      </p>
    </div>
  );
}
