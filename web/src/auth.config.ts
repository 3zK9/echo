import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // Support both AUTH_SECRET and NEXTAUTH_SECRET
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID as string,
      clientSecret: process.env.AUTH_GITHUB_SECRET as string,
    }),
  ],
  callbacks: {
    async jwt({ token, profile, account }) {
      if (account?.provider === "github") {
        const gh = profile as any;
        if (gh && typeof gh.login === "string") (token as any).username = gh.login;
      }
      return token;
    },
    async session({ session, token, user }) {
      // Always expose id and username on the session for server routes
      const userId = (user as any)?.id ?? (token as any)?.sub;
      let uname = (token as any)?.username ?? (user as any)?.username;
      try {
        const dbUser = userId
          ? await prisma.user.findUnique({ where: { id: String(userId) } })
          : (session.user?.email
              ? await prisma.user.findUnique({ where: { email: session.user.email } })
              : null);
        if (!uname) uname = dbUser?.username ?? undefined;
        // If DB username missing but token has one, persist it
        if (dbUser && !dbUser.username && uname) {
          await prisma.user.update({ where: { id: dbUser.id }, data: { username: String(uname) } });
        }
      } catch {}
      if (session.user) {
        (session.user as any).id = userId as string | undefined;
        if (uname) (session.user as any).username = uname as string;
      }
      return session;
    },
  },
  events: {
    async linkAccount({ user, account, profile }) {
      try {
        if (account?.provider === "github") {
          const gh = profile as any;
          const login = gh && typeof gh.login === "string" ? gh.login : undefined;
          if (login) {
            await prisma.user.update({ where: { id: user.id }, data: { username: login } });
          }
        }
      } catch {}
    },
  },
};
