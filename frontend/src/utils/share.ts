export function visibilityLabel(v: "busy" | "title_time" | "details"): string {
  switch (v) {
    case "busy":
      return "Busy / Free";
    case "title_time":
      return "Title + Time";
    case "details":
      return "Details";
  }
}

export function isExpired(share: { expires_at: string | null }): boolean {
  if (!share.expires_at) return false;
  return new Date(share.expires_at).getTime() <= Date.now();
}

export function isRevoked(share: { revoked_at: string | null }): boolean {
  return !!share.revoked_at;
}

export function shareStatus(share: {
  expires_at: string | null;
  revoked_at: string | null;
}): "active" | "expired" | "revoked" {
  if (share.revoked_at) return "revoked";
  if (isExpired(share)) return "expired";
  return "active";
}

export function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`;
}