import type { Calendar, CalendarEvent, MeResponse, ShareSummary, CreateShareResponse, CreateShareRequest, PublicShareResponse, FreeSlotsResponse, Poll, PollSlot, CreatePollRequest, CreatePollResponse } from "../types/api";

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
  freeSlots: (shareId: string) =>
    request<FreeSlotsResponse>(`/api/shares/${shareId}/free-slots`),
  publicFreeSlots: (token: string) =>
    request<FreeSlotsResponse>(`/api/public/shares/${token}/free-slots`),
  addContributor: (shareId: string, calendarId: string) =>
    request<FreeSlotsResponse>(`/api/shares/${shareId}/contributors`, { method: "POST", body: JSON.stringify({ calendar_id: calendarId }) }),
  addContributorByToken: (token: string, calendarId: string) =>
    request<FreeSlotsResponse>(`/api/public/shares/${token}/contributors`, { method: "POST", body: JSON.stringify({ calendar_id: calendarId }) }),
  createPoll: (body: CreatePollRequest) =>
    request<CreatePollResponse>(`/api/shares/${body.share_id}/polls`, { method: "POST", body: JSON.stringify({ title: body.title }) }),
  listPolls: (shareId: string) =>
    request<{ polls: Poll[] }>(`/api/shares/${shareId}/polls`),
  vote: (slotId: string, email: string, displayName: string | null) =>
    request<PollSlot>(`/api/polls/slots/${slotId}/vote`, { method: "POST", body: JSON.stringify({ email, display_name: displayName }) }),
  unvote: (slotId: string, email: string) =>
    request<void>(`/api/polls/slots/${slotId}/vote`, { method: "DELETE", body: JSON.stringify({ email }) }),
  login: () => { window.location.href = "/auth/login"; },
  logout: () => { window.location.href = "/auth/logout"; },
};