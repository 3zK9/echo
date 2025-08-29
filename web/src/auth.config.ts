import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
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
        if (gh && typeof gh.login === "string") token.username = gh.login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.username) {
        (session.user as any).username = token.username as string;
      }
      return session;
    },
  },
};
