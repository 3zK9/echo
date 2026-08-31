import { redirect } from "next/navigation";

export default async function DMPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  redirect(`/messages/${encodeURIComponent(user)}`);
}
