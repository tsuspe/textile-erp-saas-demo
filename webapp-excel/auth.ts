// webapp-excel/auth.ts
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(creds) {
        const username = (creds?.username ?? "").trim().toLowerCase();
        const password = (creds?.password ?? "").toString();

        if (!username || !password) return null;

        const user = await prisma.user.findUnique({
          where: { username },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            password: true,
            isActive: true,
            mustChangePassword: true,
            groups: { select: { group: { select: { key: true } } } },
          },
        });

        if (!user) return null;

        if (!user.isActive) {
          throw new Error("UserPending");
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        const groups = user.groups.map((ug) => ug.group.key);

        return {
          id: user.id,
          username: user.username,
          email: user.email ?? null,
          name: user.name,
          groups,
          mustChangePassword: user.mustChangePassword,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.username = (user as any).username;
        token.name = (user as any).name;
        token.email = (user as any).email;
        token.groups = (user as any).groups ?? [];
        token.mustChangePassword = (user as any).mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).user = {
        id: (token as any).userId,
        username: (token as any).username,
        name: (token as any).name,
        email: (token as any).email ?? null,
        groups: (token as any).groups ?? [],
        mustChangePassword: (token as any).mustChangePassword ?? false,
      };
      return session;
    },
  },
};
