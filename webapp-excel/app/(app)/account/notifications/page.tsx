import {
  archiveNotification,
  archiveReadNotifications,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/actions/chat";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import NewNotificationPanel from "./NewNotificationPanel";
import NotificationCard from "./NotificationCard";





export const dynamic = "force-dynamic";
export const revalidate = 0;

type TabKey = "all" | "chat" | "rrhh" | "admin" | "system";

function getTabFromSearch(
  sp?: Record<string, string | string[] | undefined>,
): TabKey {
  const raw = sp?.tab;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "chat" || v === "rrhh" || v === "admin" || v === "system") return v;
  return "all";
}

function getFamily(type: NotificationType): TabKey {
  // Chat
  if (
    type === NotificationType.CHAT_MENTION ||
    type === NotificationType.CHAT_BROADCAST
  ) {
    return "chat";
  }

  // RRHH (reales + custom)
  if (
    type === NotificationType.VACATION_REQUESTED ||
    type === NotificationType.VACATION_APPROVED ||
    type === NotificationType.VACATION_REJECTED ||
    type === NotificationType.TIME_REMINDER ||
    type === NotificationType.CUSTOM_RRHH
  ) {
    return "rrhh";
  }

  // Admin (custom)
  if (type === NotificationType.CUSTOM_ADMIN) {
    return "admin";
  }

  // Sistema (default)
  return "system";
}


function familyLabel(f: TabKey) {
  switch (f) {
    case "chat":
      return "Mensajes";
    case "rrhh":
      return "RRHH";
    case "admin":
      return "Admin";
    case "system":
      return "Sistema";
    default:
      return "Todas";
  }
}

function familyBadgeClasses(f: TabKey) {
  // Sin colores chillones: mismo look “sutil” que llevas
  switch (f) {
    case "chat":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "rrhh":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-200";
    case "admin":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-slate-700 bg-slate-900/40 text-slate-200";
  }
}

function normalizeHref(href: string | null | undefined): string | null {
  if (!href) return null;

  // Si viene /account/chat/<threadId> lo convertimos a /account/chat?thread=<id>
  const m = href.match(/^\/account\/chat\/([^\/\?]+)$/);
  if (m?.[1]) return `/account/chat?thread=${encodeURIComponent(m[1])}`;

  return href;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login?next=/account/notifications");

  const sp = (await searchParams) ?? {};
  const tab = getTabFromSearch(sp);
    // Si vienes desde el drawer con ?new=1 -> abre el composer por defecto
  const rawNew = sp?.new;
  const newVal = Array.isArray(rawNew) ? rawNew[0] : rawNew;
  const defaultOpen = newVal === "1";


  const { items } = await getMyNotifications({ take: 80 });

  const enriched = (items ?? []).map((n: any) => {
    const fam = getFamily(n.type as NotificationType);
    const safeHref = normalizeHref(n.href);
    return { ...n, fam, safeHref };
  });

  const filtered = tab === "all" ? enriched : enriched.filter((n) => n.fam === tab);

  const tabs: { key: TabKey; text: string }[] = [
    { key: "all", text: "Todas" },
    { key: "chat", text: "Mensajes" },
    { key: "rrhh", text: "RRHH" },
    { key: "admin", text: "Admin" },
    { key: "system", text: "Sistema" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-white/60">Cuenta</div>
          <h1 className="text-xl font-semibold">Notificaciones</h1>
          <p className="text-sm text-white/70">
            Avisos del sistema y mensajes internos. Filtra por tipo para no volverte loco.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/account"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            ← Volver a cuenta
          </Link>

          <Link
            href="/"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            Empresas
          </Link>

          <form
            action={async () => {
              "use server";
              await markAllNotificationsRead();
            }}
          >
            <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
              Marcar todo leído
            </button>
          </form>

          <form
            action={async () => {
              "use server";
              await archiveReadNotifications();
            }}
          >
            <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
              Borrar leídas
            </button>
          </form>


        </div>
      </div>

     
      <NewNotificationPanel empresaSlug="" defaultOpen={defaultOpen} />


      {/* Tabs (server-side, con links) */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = tab === t.key;
          const href =
            t.key === "all"
              ? "/account/notifications"
              : `/account/notifications?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={[
                "rounded-xl border px-3 py-2 text-xs",
                active
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
              ].join(" ")}
            >
              {t.text}
            </Link>
          );
        })}
      </div>

      <div className="space-y-2">
        {filtered.length ? (
          filtered.map((n: any) => {
            const famText = familyLabel(n.fam as TabKey);
            const badgeCls = familyBadgeClasses(n.fam as TabKey);
            const isNew = !n.readAt;

            return (
              <NotificationCard
                key={n.id}
                href={n.safeHref ?? null}
                actions={
                  <>
                  {n.safeHref ? (
                    <form
                      action={async () => {
                        "use server";
                        await markNotificationRead(n.id);
                        redirect(n.safeHref);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-xs text-white/40 hover:text-white/70"
                        aria-label="Abrir"
                        title="Abrir"
                      >
                        →
                      </button>
                    </form>
                  ) : null}


                    {isNew ? (
                      <form
                        action={async () => {
                          "use server";
                          await markNotificationRead(n.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/15"
                          title="Marcar como leído"
                        >
                          Leído
                        </button>
                      </form>
                    ) : (
                      <form
                        action={async () => {
                          "use server";
                          await archiveNotification(n.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                          title="Borrar notificación"
                        >
                          Borrar
                        </button>
                      </form>
                    )}

                  </>
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${badgeCls}`}
                  >
                    {famText}
                  </span>
                  {isNew ? (
                    <span className="text-[11px] text-rose-300">Nuevo</span>
                  ) : (
                    <span className="text-[11px] text-white/40">Leído</span>
                  )}
                </div>

                <div className="mt-2 font-semibold text-white/95">{n.title}</div>

                {n.body ? <div className="mt-1 text-sm text-white/70">{n.body}</div> : null}

                <div className="mt-2 text-xs text-white/40">
                  {new Date(n.createdAt).toLocaleString("es-ES")}
                </div>
              </NotificationCard>
            );

          })
        ) : (
          <div className="text-sm text-white/70">No tienes notificaciones.</div>
        )}
      </div>
    </div>
  );
}
