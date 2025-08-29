import { redirect } from "next/navigation";

export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp?.callbackUrl;
  if (callbackUrl) redirect(`/?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  redirect("/");
}
