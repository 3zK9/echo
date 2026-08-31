import "server-only";

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { parseAdminGithubAccountIds } from "@/lib/admin-config";

export interface AdminIdentity {
  githubAccountId: string;
}

/**
 * Authorize an owner by the immutable GitHub provider account ID stored by
 * NextAuth. Usernames, email addresses, and client-side session claims are
 * intentionally not accepted as authorization inputs.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const allowedIds = parseAdminGithubAccountIds(process.env.ADMIN_GITHUB_ACCOUNT_IDS);
  if (allowedIds.length === 0) return null;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;

  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "github",
      providerAccountId: { in: allowedIds },
    },
    select: { providerAccountId: true },
  });

  return account ? { githubAccountId: account.providerAccountId } : null;
}

export async function requireAdmin(): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();
  if (!identity) notFound();
  return identity;
}
