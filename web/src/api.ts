import type {
  Chat,
  Message,
  MonitoredChat,
  Stats,
  WhatsAppChat,
  AppSettings,
  PairingStatus,
} from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fp = () => localStorage.getItem("fingerprint") || "";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const fingerprint = fp();
  if (fingerprint) headers["X-Fingerprint"] = fingerprint;

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    if (!window.location.pathname.endsWith("/login")) {
      window.location.href = BASE + "/";
    }
    throw new Error("Unauthorized");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok)
    throw new Error(
      data.error || data.message || `Request failed with status ${res.status}`,
    );

  return data as T;
}

async function silentRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const fingerprint = fp();
  if (fingerprint) headers["X-Fingerprint"] = fingerprint;

  try {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function login(
  password: string,
  fingerprint: string,
): Promise<{ success: boolean; token?: string }> {
  return request(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password, fingerprint }),
  });
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const data = await request<{ authenticated: boolean }>(
      `${BASE}/api/auth/verify`,
    );
    return data.authenticated;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
  localStorage.removeItem("fingerprint");
}

export async function fetchStats(): Promise<Stats> {
  return request<Stats>(`${BASE}/api/status`);
}

export async function fetchStatsSilent(): Promise<Stats | null> {
  return silentRequest<Stats>(`${BASE}/api/status`);
}

export async function fetchChats(): Promise<Chat[]> {
  const data = await request<{ chats: Chat[] }>(`${BASE}/api/chats`);
  return data.chats;
}

export async function fetchChatsSilent(): Promise<Chat[] | null> {
  const data = await silentRequest<{ chats: Chat[] }>(`${BASE}/api/chats`);
  return data?.chats ?? null;
}

export async function markChatAsRead(chatId: string): Promise<void> {
  await request(`${BASE}/api/chats/${encodeURIComponent(chatId)}/read`, {
    method: "POST",
  });
}

export async function fetchMessages(
  chatId: string,
  limit = 200,
): Promise<Message[]> {
  const data = await request<{ messages: Message[] }>(
    `${BASE}/api/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`,
  );
  return data.messages;
}

export async function fetchMessagesSilent(
  chatId: string,
  limit = 200,
): Promise<Message[] | null> {
  const data = await silentRequest<{ messages: Message[] }>(
    `${BASE}/api/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`,
  );
  return data?.messages ?? null;
}

export async function fetchMonitored(): Promise<MonitoredChat[]> {
  const data = await request<{ monitored: MonitoredChat[] }>(
    `${BASE}/api/monitored`,
  );
  return data.monitored;
}

export async function addMonitored(
  chatId: string,
  name: string,
  isGroup: boolean,
): Promise<void> {
  await request(`${BASE}/api/monitored`, {
    method: "POST",
    body: JSON.stringify({ chatId, name, isGroup }),
  });
}

export async function removeMonitored(chatId: string): Promise<void> {
  await request(`${BASE}/api/monitored/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export async function fetchWhatsAppChats(): Promise<WhatsAppChat[]> {
  const data = await request<{ chats: WhatsAppChat[] }>(
    `${BASE}/api/whatsapp/chats`,
  );
  return data.chats;
}

export async function fetchSettings(): Promise<AppSettings> {
  return request<AppSettings>(`${BASE}/api/settings`);
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await request(`${BASE}/api/settings/update`, {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}

export async function setNotifyEnabled(enabled: boolean): Promise<void> {
  await updateSetting("whatsapp_notify", enabled.toString());
}

export async function clearData(password: string): Promise<void> {
  await request(`${BASE}/api/data`, {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export async function fetchPairingStatus(): Promise<PairingStatus> {
  return request<PairingStatus>(`${BASE}/api/whatsapp/pairing`);
}

export async function resetWhatsApp(requestPairing = true): Promise<void> {
  await request(`${BASE}/api/whatsapp/reset`, {
    method: "POST",
    body: JSON.stringify({ requestPairing }),
  });
}

export function createWs(onEvent: (_event: string, _data: any) => void): {
  close: () => void;
} {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let pingCheckTimer: ReturnType<typeof setInterval> | null = null;
  let lastPong = Date.now();

  const MAX_RECONNECT_DELAY = 15_000;
  const PING_TIMEOUT = 40_000;

  function connect() {
    if (stopped) return;

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}${BASE}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected");
      reconnectDelay = 1000;
      lastPong = Date.now();

      pingCheckTimer = setInterval(() => {
        if (Date.now() - lastPong > PING_TIMEOUT) {
          console.log("[WS] No ping from server, reconnecting...");
          ws?.close();
        }
      }, PING_TIMEOUT);
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        if (event === "ping") {
          lastPong = Date.now();
          ws?.send(JSON.stringify({ event: "pong", data }));
          return;
        }
        onEvent(event, data);
      } catch {
        /* ignore */
      }
    };

    ws.onclose = (e) => {
      console.log(`[WS] Closed (code: ${e.code})`);
      if (pingCheckTimer) {
        clearInterval(pingCheckTimer);
        pingCheckTimer = null;
      }
      if (!stopped) {
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      console.log("[WS] Error");
    };
  }

  connect();

  return {
    close: () => {
      stopped = true;
      if (pingCheckTimer) {
        clearInterval(pingCheckTimer);
        pingCheckTimer = null;
      }
      ws?.close();
    },
  };
}
