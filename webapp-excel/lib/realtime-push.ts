// lib/realtime-push.ts

type PushPayload = unknown;

function getRealtimeConfig() {
  const url = process.env.REALTIME_URL;
  const token = process.env.REALTIME_INTERNAL_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function internalPush(body: Record<string, unknown>) {
  const cfg = getRealtimeConfig();
  if (!cfg) return;

  try {
    await fetch(`${cfg.url}/internal/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[realtime] internal push failed", err);
    }
  }
}

export async function pushToUser(userId: string, event: string, payload: PushPayload) {
  if (!userId || !event) return;
  await internalPush({ userId, event, payload });
}

export async function pushToThread(threadId: string, event: string, payload: PushPayload) {
  if (!threadId || !event) return;
  await internalPush({ threadId, event, payload });
}

// @todos
export async function pushBroadcast(event: string, payload: PushPayload) {
  if (!event) return;
  await internalPush({ broadcast: true, event, payload });
}

// grupos (opcional)
export async function pushToGroup(groupKey: string, event: string, payload: PushPayload) {
  if (!groupKey || !event) return;
  await internalPush({ groupKey, event, payload });
}
