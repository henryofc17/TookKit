// ─── IPTV API Types ─────────────────────────────────────────────────────────

// ── Job Types ──

export type JobStatus = 'running' | 'paused' | 'cancelled' | 'completed'
export type ResultStatus = 'hit' | 'bad' | 'timeout'

export interface Job {
  id: string
  sessionId: string
  inputMode: 'url' | 'combo'
  serverHost: string
  status: JobStatus
  totalLines: number
  processed: number
  hits: number
  bad: number
  timeout: number
  progress: number
  createdAt: string
  updatedAt: string
}

export interface JobDetail extends Job {
  pendingCount: number
  remainingLines: number
  completedAt: string | null
}

export interface JobResult {
  id: string
  line: string
  status: ResultStatus
  host: string
  username: string
  password: string
  url: string
  info: Record<string, unknown> | null
  error: string | null
  createdAt: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface JobResultsResponse {
  results: JobResult[]
  pagination: Pagination
  jobStats: {
    totalLines: number
    processed: number
    hits: number
    bad: number
    timeout: number
    status: JobStatus
  }
}

export interface ProcessBatchResult {
  status: JobStatus
  message?: string
  processed: number
  hits: number
  bad: number
  timeout: number
  totalLines: number
  pendingCount: number
  progress: number
  results: Array<{
    line: string
    status: ResultStatus
    host: string | undefined
    username: string | undefined
    password: string | undefined
    url: string | undefined
    info: Record<string, unknown> | undefined
    error: string | undefined
  }>
}

export interface CreateJobInput {
  lines: string[]
  inputMode: 'url' | 'combo'
  serverHost?: string
  threads?: number
}

export interface CancelJobInput {
  action: 'cancel' | 'pause'
}

// ── Playlist Types ──

export interface PlaylistSummary {
  id: string
  url: string
  name: string
  channelCount: number
  accessedAt: string
}

export interface Channel {
  name: string
  url: string
  logo: string
  group: string
  tvgId: string
}

export interface PlaylistDetail {
  id: string
  url: string
  name: string
  channelCount: number
  channels: Channel[]
  groups: string[]
  createdAt: string
  accessedAt: string
}

export interface SavePlaylistInput {
  url: string
  name?: string
  channels: Channel[]
  groups: string[]
}

// ── Favorite Types ──

export interface Favorite {
  id: string
  channelName: string
  channelUrl: string
  channelLogo: string
  channelGroup: string
  createdAt: string
}

export interface AddFavoriteInput {
  channelName: string
  channelUrl: string
  channelLogo?: string
  channelGroup?: string
}

export interface RemoveFavoriteInput {
  channelUrl: string
}

// ── History Types ──

export interface HistoryEntry {
  id: string
  channelName: string
  channelUrl: string
  channelLogo: string
  channelGroup: string
  watchedAt: string
}

export interface AddHistoryInput {
  channelName: string
  channelUrl: string
  channelLogo?: string
  channelGroup?: string
}

// ── Player State Types ──

export interface CurrentChannel {
  name: string
  url: string
  logo: string
  group: string
}

export interface PlayerState {
  id: string
  playlistUrl: string
  currentChannel: CurrentChannel | null
  selectedGroup: string
  volume: number
  isMuted: boolean
  useProxy: boolean
  updatedAt: string
}

export interface SavePlayerStateInput {
  playlistUrl?: string
  currentChannel?: CurrentChannel
  selectedGroup?: string
  volume?: number
  isMuted?: boolean
  useProxy?: boolean
}

// ── Resume Types ──

export interface ResumeState {
  activeJobs: Array<{
    id: string
    inputMode: 'url' | 'combo'
    serverHost: string
    status: JobStatus
    totalLines: number
    processed: number
    hits: number
    bad: number
    timeout: number
    createdAt: string
    updatedAt: string
  }>
  playlists: PlaylistSummary[]
  favorites: Favorite[]
  recentHistory: HistoryEntry[]
  playerState: PlayerState | null
  lastPlaylist: PlaylistDetail | null
}

// ─── API Error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ─── Fetch Helpers ──────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data = await res.json()

  if (!res.ok) {
    throw new ApiError(data.error || 'Unknown error', res.status)
  }

  return data as T
}

// ── Job API ──

export async function fetchActiveJobs(): Promise<{ jobs: Job[] }> {
  return apiFetch('/api/iptv/jobs')
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  return apiFetch('/api/iptv/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchJobStatus(jobId: string): Promise<JobDetail> {
  return apiFetch(`/api/iptv/jobs/${jobId}`)
}

export async function processBatch(
  jobId: string,
  threads?: number
): Promise<ProcessBatchResult> {
  return apiFetch(`/api/iptv/jobs/${jobId}/process`, {
    method: 'POST',
    body: JSON.stringify(threads ? { threads } : {}),
  })
}

export async function cancelJob(
  jobId: string,
  action: 'cancel' | 'pause'
): Promise<{ id: string; status: JobStatus; processed: number; hits: number; bad: number; timeout: number; progress: number; completedAt: string | null }> {
  return apiFetch(`/api/iptv/jobs/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  })
}

export async function fetchJobResults(
  jobId: string,
  status?: string,
  page?: number
): Promise<JobResultsResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (page) params.set('page', String(page))
  const qs = params.toString()
  return apiFetch(`/api/iptv/jobs/${jobId}/results${qs ? `?${qs}` : ''}`)
}

// ── Playlist API ──

export async function fetchPlaylists(): Promise<{ playlists: PlaylistSummary[] }> {
  return apiFetch('/api/iptv/playlists')
}

export async function fetchPlaylist(id: string): Promise<PlaylistDetail> {
  return apiFetch(`/api/iptv/playlists/${id}`)
}

export async function savePlaylist(input: SavePlaylistInput): Promise<{
  id: string
  url: string
  name: string
  channelCount: number
  createdAt: string
  accessedAt: string
}> {
  return apiFetch('/api/iptv/playlists', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deletePlaylist(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/iptv/playlists/${id}`, {
    method: 'DELETE',
  })
}

// ── Favorites API ──

export async function fetchFavorites(): Promise<{ favorites: Favorite[] }> {
  return apiFetch('/api/iptv/favorites')
}

export async function addFavorite(input: AddFavoriteInput): Promise<Favorite> {
  return apiFetch('/api/iptv/favorites', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function removeFavorite(input: RemoveFavoriteInput): Promise<{ success: boolean }> {
  return apiFetch('/api/iptv/favorites', {
    method: 'DELETE',
    body: JSON.stringify(input),
  })
}

// ── History API ──

export async function fetchHistory(): Promise<{ history: HistoryEntry[] }> {
  return apiFetch('/api/iptv/history')
}

export async function addHistory(input: AddHistoryInput): Promise<{
  id: string
  channelName: string
  channelUrl: string
  channelLogo: string
  channelGroup: string
  watchedAt: string
}> {
  return apiFetch('/api/iptv/history', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ── Player State API ──

export async function fetchPlayerState(): Promise<{ state: PlayerState | null }> {
  return apiFetch('/api/iptv/state')
}

export async function savePlayerState(input: SavePlayerStateInput): Promise<{ state: PlayerState }> {
  return apiFetch('/api/iptv/state', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// ── Resume API ──

export async function fetchResumeState(): Promise<ResumeState> {
  return apiFetch('/api/iptv/resume')
}
