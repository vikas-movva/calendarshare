// Use RELATIVE paths so the app works both in dev (Vite proxies /api and
// /auth to the backend) and in production (frontend + backend on one origin).
// This avoids CORS entirely in dev; in production serve the frontend from
// the same domain as the API (see README).
export const API_BASE = "";

export interface Calendar {
  id: string;
  name: string;
  timezone?: string | null;
}

export interface CalendarEvent {
  provider_event_id?: string | null;
  title?: string | null;
  start: string;
  end: string;
  timezone?: string | null;
  location?: string | null;
  description?: string | null;
  is_all_day?: boolean;
}

export interface CreateShareRequest {
  calendar_id: string;
  start_time: string;
  end_time: string;
  visibility: "busy" | "title_time" | "details";
  expires_at: string | null;
  timezone?: string;
}

export interface CreateShareResponse {
  id: string;
  url: string;
  expires_at: string | null;
}

export interface ShareSummary {
  id: string;
  start_time: string;
  end_time: string;
  timezone: string;
  visibility: "busy" | "title_time" | "details";
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PublicEvent {
  title: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  description: string | null;
  is_all_day: boolean;
}

export interface PublicShareResponse {
  owner: { display_name: string | null };
  range: { start: string; end: string };
  timezone: string;
  visibility: "busy" | "title_time" | "details";
  events: PublicEvent[];
}

export interface MeResponse {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}