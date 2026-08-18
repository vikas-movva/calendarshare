import type { Calendar, CalendarEvent, MeResponse, ShareSummary, CreateShareResponse, CreateShareRequest, PublicShareResponse } from "../types/api";

// Use RELATIVE paths so the Vite dev proxy forwards /api and /auth to the
// backend. This avoids CORS entirely in dev; in production the frontend and
// backend should be served from the same origin (see README).
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  me: () => request<MeResponse>("/api/me"),
  listCalendars: () => request<{ calendars: Calendar[] }>("/api/calendars"),
  listEvents: (calendarId: string, start: string, end: string) =>
    request<{ events: CalendarEvent[] }>(`/api/calendars/${calendarId}/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  createShare: (body: CreateShareRequest) =>
    request<CreateShareResponse>("/api/shares", { method: "POST", body: JSON.stringify(body) }),
  listShares: () => request<{ shares: ShareSummary[] }>("/api/shares"),
  revokeShare: (id: string) => request<void>(`/api/shares/${id}`, { method: "DELETE" }),
  publicShare: (token: string) => request<PublicShareResponse>(`/api/public/shares/${token}`),
  login: () => { window.location.href = "/auth/login"; },
  logout: () => { window.location.href = "/auth/logout"; },
};