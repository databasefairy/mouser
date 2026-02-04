import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticateUser, initializeDefaultAdmin, type UserRole } from "./users";

// Initialize default admin on module load
initializeDefaultAdmin();

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV !== "production",
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password?.trim();
        
        if (!username || !password) return null;
        
        // Authenticate against user database - username and password must match
        const user = authenticateUser(username, password);
        if (user) {
          return {
            id: user.role, // Store role as ID for easy access
            name: user.username,
            email: user.role, // Store role in email field too for redundancy
            image: null,
          };
        }
        
        return null;
      },
    }),
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id != null) token.id = user.id;
      if (user?.name != null) token.name = user.name;
      if (user?.email != null) token.role = user.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user != null) {
        (session.user as { id?: string; role?: string }).id = token.id as string;
        (session.user as { id?: string; role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};

// Helper to check roles
export function hasRole(session: { user?: { id?: string; role?: string } } | null, roles: UserRole[]): boolean {
  const role = session?.user?.role || session?.user?.id;
  return roles.includes(role as UserRole);
}

export function isAdmin(session: { user?: { id?: string; role?: string } } | null): boolean {
  return hasRole(session, ["admin"]);
}

export function isLimitless(session: { user?: { id?: string; role?: string } } | null): boolean {
  return hasRole(session, ["admin", "power_user"]);
}
