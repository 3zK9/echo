import "server-only";

import { NextResponse } from "next/server";

export function legacyDmGoneResponse() {
  return NextResponse.json(
    { error: "direct_messages_unavailable" },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
