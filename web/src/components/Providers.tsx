"use client";

import { SessionProvider } from "next-auth/react";
import { EchoesProvider } from "@/state/echoes";
import { ToastProvider } from "@/components/Toast";
import { ProfileProvider } from "@/state/profile";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <EchoesProvider>
        <ProfileProvider>
          <ToastProvider>{children}</ToastProvider>
        </ProfileProvider>
      </EchoesProvider>
    </SessionProvider>
  );
}
