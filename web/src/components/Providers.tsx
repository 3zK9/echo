"use client";

import { SessionProvider } from "next-auth/react";
import { TweetsProvider } from "@/state/tweets";
import { ToastProvider } from "@/components/Toast";
import { ProfileProvider } from "@/state/profile";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TweetsProvider>
        <ProfileProvider>
          <ToastProvider>{children}</ToastProvider>
        </ProfileProvider>
      </TweetsProvider>
    </SessionProvider>
  );
}
