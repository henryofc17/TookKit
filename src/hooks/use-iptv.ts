'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {
  // Types
  type Job,
  type JobDetail,
  type JobResultsResponse,
  type ProcessBatchResult,
  type CreateJobInput,
  type CancelJobInput,
  type PlaylistSummary,
  type PlaylistDetail,
  type SavePlaylistInput,
  type Favorite,
  type AddFavoriteInput,
  type RemoveFavoriteInput,
  type HistoryEntry,
  type AddHistoryInput,
  type PlayerState,
  type SavePlayerStateInput,
  type ResumeState,

  // Fetch helpers
  fetchActiveJobs,
  createJob,
  fetchJobStatus,
  processBatch,
  cancelJob,
  fetchJobResults,
  fetchPlaylists,
  fetchPlaylist,
  savePlaylist,
  deletePlaylist,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  fetchHistory,
  addHistory,
  fetchPlayerState,
  savePlayerState,
  fetchResumeState,
} from '@/lib/iptv-api'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const iptvKeys = {
  all: ['iptv'] as const,
  jobs: ['iptv', 'jobs'] as const,
  job: (id: string) => ['iptv', 'job', id] as const,
  jobResults: (id: string, status?: string, page?: number) =>
    ['iptv', 'job', id, 'results', status ?? 'all', page ?? 1] as const,
  playlists: ['iptv', 'playlists'] as const,
  playlist: (id: string) => ['iptv', 'playlist', id] as const,
  favorites: ['iptv', 'favorites'] as const,
  history: ['iptv', 'history'] as const,
  state: ['iptv', 'state'] as const,
  resume: ['iptv', 'resume'] as const,
}

// ─── Job Hooks ──────────────────────────────────────────────────────────────

/**
 * Fetch active (running) jobs. Polls every 2 seconds when there are running jobs.
 */
export function useActiveJobs() {
  const query = useQuery<{ jobs: Job[] }>({
    queryKey: iptvKeys.jobs,
    queryFn: fetchActiveJobs,
  })

  const hasRunningJobs = (query.data?.jobs ?? []).length > 0

  // Re-fetch with interval only when there are running jobs
  useQuery<{ jobs: Job[] }>({
    queryKey: iptvKeys.jobs,
    queryFn: fetchActiveJobs,
    refetchInterval: hasRunningJobs ? 2000 : false,
    enabled: hasRunningJobs,
  })

  return query
}

/**
 * Get details + progress for a specific job.
 */
export function useJobStatus(jobId: string | null) {
  return useQuery<JobDetail>({
    queryKey: iptvKeys.job(jobId ?? ''),
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !!jobId,
  })
}

/**
 * Get paginated results for a job, optionally filtered by status.
 */
export function useJobResults(
  jobId: string | null,
  status?: string,
  page?: number
) {
  return useQuery<JobResultsResponse>({
    queryKey: iptvKeys.jobResults(jobId ?? '', status, page),
    queryFn: () => fetchJobResults(jobId!, status, page),
    enabled: !!jobId,
  })
}

/**
 * Create a new IPTV check job.
 */
export function useCreateJob() {
  const queryClient = useQueryClient()

  return useMutation<{ id: string; sessionId: string; inputMode: string; serverHost: string; status: string; totalLines: number; processed: number; hits: number; bad: number; timeout: number; createdAt: string }, Error, CreateJobInput>({
    mutationFn: (input) => createJob(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.jobs })
    },
  })
}

/**
 * Process the next batch of lines for a job.
 */
export function useProcessBatch(jobId: string | null) {
  const queryClient = useQueryClient()

  return useMutation<ProcessBatchResult, Error, number | undefined>({
    mutationFn: (threads) => processBatch(jobId!, threads),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.jobs })
      if (jobId) {
        queryClient.invalidateQueries({ queryKey: iptvKeys.job(jobId) })
        queryClient.invalidateQueries({ queryKey: ['iptv', 'job', jobId, 'results'] })
      }
    },
  })
}

/**
 * Cancel or pause a job.
 */
export function useCancelJob(jobId: string | null) {
  const queryClient = useQueryClient()

  return useMutation<{ id: string; status: string; processed: number; hits: number; bad: number; timeout: number; progress: number; completedAt: string | null }, Error, CancelJobInput>({
    mutationFn: (input) => cancelJob(jobId!, input.action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.jobs })
      if (jobId) {
        queryClient.invalidateQueries({ queryKey: iptvKeys.job(jobId) })
      }
    },
  })
}

// ─── Playlist Hooks ─────────────────────────────────────────────────────────

/**
 * List saved playlists for the session.
 */
export function usePlaylists() {
  return useQuery<{ playlists: PlaylistSummary[] }>({
    queryKey: iptvKeys.playlists,
    queryFn: fetchPlaylists,
  })
}

/**
 * Get a full playlist with channels.
 */
export function usePlaylist(id: string | null) {
  return useQuery<PlaylistDetail>({
    queryKey: iptvKeys.playlist(id ?? ''),
    queryFn: () => fetchPlaylist(id!),
    enabled: !!id,
  })
}

/**
 * Save a new playlist.
 */
export function useSavePlaylist() {
  const queryClient = useQueryClient()

  return useMutation<{ id: string; url: string; name: string; channelCount: number; createdAt: string; accessedAt: string }, Error, SavePlaylistInput>({
    mutationFn: (input) => savePlaylist(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.playlists })
    },
  })
}

/**
 * Delete a playlist by ID.
 */
export function useDeletePlaylist() {
  const queryClient = useQueryClient()

  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (id) => deletePlaylist(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.playlists })
      queryClient.removeQueries({ queryKey: iptvKeys.playlist(deletedId) })
    },
  })
}

// ─── Favorites Hooks ────────────────────────────────────────────────────────

/**
 * List favorite channels for the session.
 */
export function useFavorites() {
  return useQuery<{ favorites: Favorite[] }>({
    queryKey: iptvKeys.favorites,
    queryFn: fetchFavorites,
  })
}

/**
 * Add a channel to favorites.
 */
export function useAddFavorite() {
  const queryClient = useQueryClient()

  return useMutation<Favorite, Error, AddFavoriteInput>({
    mutationFn: (input) => addFavorite(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.favorites })
    },
  })
}

/**
 * Remove a channel from favorites.
 */
export function useRemoveFavorite() {
  const queryClient = useQueryClient()

  return useMutation<{ success: boolean }, Error, RemoveFavoriteInput>({
    mutationFn: (input) => removeFavorite(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.favorites })
    },
  })
}

// ─── History Hooks ──────────────────────────────────────────────────────────

/**
 * List recent watch history for the session.
 */
export function useHistory() {
  return useQuery<{ history: HistoryEntry[] }>({
    queryKey: iptvKeys.history,
    queryFn: fetchHistory,
  })
}

/**
 * Add or update a watch history entry.
 */
export function useAddHistory() {
  const queryClient = useQueryClient()

  return useMutation<{ id: string; channelName: string; channelUrl: string; channelLogo: string; channelGroup: string; watchedAt: string }, Error, AddHistoryInput>({
    mutationFn: (input) => addHistory(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.history })
    },
  })
}

// ─── Player State Hooks ────────────────────────────────────────────────────

/**
 * Get current player state for the session.
 */
export function usePlayerState() {
  return useQuery<{ state: PlayerState | null }>({
    queryKey: iptvKeys.state,
    queryFn: fetchPlayerState,
  })
}

/**
 * Save (upsert) player state.
 */
export function useSavePlayerState() {
  const queryClient = useQueryClient()

  return useMutation<{ state: PlayerState }, Error, SavePlayerStateInput>({
    mutationFn: (input) => savePlayerState(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: iptvKeys.state })
    },
  })
}

// ─── Resume Hook ────────────────────────────────────────────────────────────

/**
 * Full state recovery — fetches everything needed to restore a session.
 */
export function useResumeState() {
  return useQuery<ResumeState>({
    queryKey: iptvKeys.resume,
    queryFn: fetchResumeState,
    staleTime: 0, // always fresh on mount
  })
}
