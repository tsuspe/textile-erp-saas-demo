// app/(app)/account/chat/page.tsx
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountChatPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login?next=/account/chat");

  const sp = (await searchParams) ?? {};
  const raw = sp.thread;
  const threadFromQuery = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Cuenta</div>
            <div className="text-sm font-semibold text-slate-100">Chat</div>
            <div className="text-xs text-slate-400">
              Canales y DMs. Tip: en el drawer puedes mandar <b>@usuario mensaje</b>.
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/account"
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
            >
              ← Volver a cuenta
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
            >
              Empresas
            </Link>
          </div>
        </div>

        <ChatClient initialThreadId={threadFromQuery ?? null} />
      </div>
    </div>
  );
}
