import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
  });
}

export function useCalendars() {
  const me = useMe()
  return useQuery({
    queryKey: ["calendars"],
    queryFn: () => api.listCalendars(),
    enabled: me.isSuccess,
    retry: false,
  });
}

export function useEvents(calendarId: string | null, start: string, end: string) {
  return useQuery({
    queryKey: ["events", calendarId, start, end],
    queryFn: () => api.listEvents(calendarId!, start, end),
    enabled: !!calendarId,
  });
}

export function useShares() {
  return useQuery({
    queryKey: ["shares"],
    queryFn: api.listShares,
  });
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createShare,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.revokeShare,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });
}

export function usePublicShare(token: string) {
  return useQuery({
    queryKey: ["public", token],
    queryFn: () => api.publicShare(token),
    retry: false,
  });
}

export function useFreeSlots(shareId: string | null) {
  return useQuery({
    queryKey: ["free-slots", shareId],
    queryFn: () => api.freeSlots(shareId!),
    enabled: !!shareId,
  });
}

export function usePublicFreeSlots(token: string) {
  return useQuery({
    queryKey: ["free-slots", "public", token],
    queryFn: () => api.publicFreeSlots(token),
    retry: false,
  });
}

export function useAddContributor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shareId, token, calendarId }: { shareId?: string; token?: string; calendarId: string }) =>
      token ? api.addContributorByToken(token, calendarId) : api.addContributor(shareId!, calendarId),
    // Adding a calendar merges new events into the share, which changes the
    // busy-time snapshot, free slots, and any polls built from it. Invalidate
    // every derived cache so the public page re-renders with the new data.
    onSuccess: (_data, { shareId, token }) => {
      if (token) {
        qc.invalidateQueries({ queryKey: ["public", token] });
        qc.invalidateQueries({ queryKey: ["free-slots", "public", token] });
        qc.invalidateQueries({ queryKey: ["polls", shareId] });
      } else if (shareId) {
        qc.invalidateQueries({ queryKey: ["free-slots", shareId] });
      }
    },
  });
}

export function useCreatePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { shareId: string; title: string | null }) =>
      api.createPoll({ share_id: body.shareId, title: body.title }),
    onSuccess: (_data, { shareId }) => {
      qc.invalidateQueries({ queryKey: ["polls", shareId] });
    },
  });
}

export function useListPolls(shareId: string | null) {
  return useQuery({
    queryKey: ["polls", shareId],
    queryFn: () => api.listPolls(shareId!),
    enabled: !!shareId,
  });
}
export function useVoteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, email, displayName }: { slotId: string; email: string; displayName: string | null }) =>
      api.vote(slotId, email, displayName),
    // Votes live in two caches: the public share page (polls are embedded in
    // the share response) and the logged-in polls page. Invalidate both so the
    // Voted chip re-renders immediately after voting from either surface.
    onSuccess: (_data, { slotId }) => {
      qc.invalidateQueries({ queryKey: ["public"] });
      qc.invalidateQueries({ queryKey: ["polls"] });
      qc.invalidateQueries({ queryKey: ["poll", slotId] });
    },
  });
}

export function useUnvoteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, email }: { slotId: string; email: string }) =>
      api.unvote(slotId, email),
    onSuccess: (_data, { slotId }) => {
      qc.invalidateQueries({ queryKey: ["public"] });
      qc.invalidateQueries({ queryKey: ["polls"] });
      qc.invalidateQueries({ queryKey: ["poll", slotId] });
    },
  });
}