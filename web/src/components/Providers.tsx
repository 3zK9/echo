"use client";

import { SessionProvider } from "next-auth/react";
import { EchoesProvider } from "@/state/echoes";
import { ToastProvider } from "@/components/Toast";
import { ProfileProvider } from "@/state/profile";
import { ConfirmProvider } from "@/components/Confirm";
import { SWRConfig } from "swr";
import { swrConfig } from "@/lib/swr";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { mutate } from "swr";
import { keys } from "@/lib/keys";

function BackgroundPrefetch() {
  const { data: session } = useSession();
  useEffect(() => {
    const username = (session?.user as any)?.username as string | undefined;
    if (!username) return;
    // Prefetch first page of own profile echoes and likes
    const limit = 20;
    fetch(`/api/users/${encodeURIComponent(username)}/echoes?limit=${limit}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) mutate(keys.profileEchoes(username, null, limit), data, { revalidate: false }); })
      .catch(() => {});
    fetch(`/api/users/${encodeURIComponent(username)}/likes?limit=${limit}&offset=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) mutate(keys.profileLikes(username, 0, limit), data, { revalidate: false }); })
      .catch(() => {});
  }, [session?.user]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <EchoesProvider>
        <ProfileProvider>
          <ToastProvider>
            <SWRConfig value={swrConfig}>
              <ConfirmProvider>
                <BackgroundPrefetch />
                {children}
              </ConfirmProvider>
            </SWRConfig>
          </ToastProvider>
        </ProfileProvider>
      </EchoesProvider>
    </SessionProvider>
  );
}
