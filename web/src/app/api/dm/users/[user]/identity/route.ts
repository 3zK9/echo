import { legacyDmGoneResponse } from "@/lib/legacy-dm";

export async function GET() {
  return legacyDmGoneResponse();
}
