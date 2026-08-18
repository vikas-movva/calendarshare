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
  return useQuery({
    queryKey: ["calendars"],
    queryFn: () => api.listCalendars(),
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