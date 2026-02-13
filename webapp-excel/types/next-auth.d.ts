// webapp-excel/types/next-auth.d.ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      name: string;
      email?: string | null;
      groups: string[];
      mustChangePassword: boolean;
    };
  }
}
