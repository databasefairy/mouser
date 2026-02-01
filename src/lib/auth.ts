import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV !== "production",
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
          }),
        ]
      : []),
    ...(process.env.MOUSER_LOGIN_PASSWORD || process.env.MOUSER_RATE_LIMIT_EXEMPT_PASSWORD
      ? [
          CredentialsProvider({
            name: "Password",
            credentials: {
              username: { label: "Username", type: "text", placeholder: "any" },
              password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
              const p = credentials?.password?.trim();
              const exempt = process.env.MOUSER_RATE_LIMIT_EXEMPT_PASSWORD?.trim();
              const login = process.env.MOUSER_LOGIN_PASSWORD?.trim();
              if (exempt && p === exempt) {
                return {
                  id: "rate_limit_exempt",
                  name: credentials?.username ?? "User",
                  email: null,
                  image: null,
                };
              }
              if (login && p === login) {
                return {
                  id: "credentials",
                  name: credentials?.username ?? "User",
                  email: null,
                  image: null,
                };
              }
              return null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id != null) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user != null && token.id != null) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};
