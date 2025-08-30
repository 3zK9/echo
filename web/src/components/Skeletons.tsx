"use client";

import React from "react";

export function EchoSkeletonRow() {
  return (
    <div className="flex gap-3 px-4 py-4 border-b border-white/10 animate-pulse">
      <div className="shrink-0">
        <div className="w-10 h-10 rounded-full bg-white/10" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-4 w-36 bg-white/10 rounded" />
        <div className="mt-2 space-y-2">
          <div className="h-3 w-full bg-white/10 rounded" />
          <div className="h-3 w-5/6 bg-white/10 rounded" />
        </div>
        <div className="mt-3 flex items-center gap-6 text-sm">
          <div className="h-5 w-12 bg-white/10 rounded" />
          <div className="h-5 w-12 bg-white/10 rounded" />
          <div className="h-5 w-12 bg-white/10 rounded" />
          <div className="ml-auto h-5 w-12 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}

export function EchoSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="panel mt-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <EchoSkeletonRow key={i} />
      ))}
    </div>
  );
}

