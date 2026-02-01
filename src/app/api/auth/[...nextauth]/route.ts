import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";

const authOptions: NextAuthOptions = {
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
    ...(process.env.MOUSER_LOGIN_PASSWORD
      ? [
          CredentialsProvider({
            name: "Password",
            credentials: {
              username: { label: "Username", type: "text", placeholder: "any" },
              password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
              if (
                credentials?.password === process.env.MOUSER_LOGIN_PASSWORD
              ) {
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
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
