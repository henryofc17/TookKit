'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Tv, Loader2, Volume2, VolumeX, Square, Zap, Maximize, Minimize, Info, Heart,
  RefreshCw, Clock, ListVideo, Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { List, useListRef } from 'react-window'
import {
  usePlaylists, usePlaylist, useSavePlaylist, useDeletePlaylist,
  useFavorites, useAddFavorite, useRemoveFavorite,
  useHistory, useAddHistory,
  useSavePlayerState,
  useResumeState,
} from '@/hooks/use-iptv'
import type {
  Channel, Favorite, HistoryEntry, PlaylistSummary,
  AddFavoriteInput, SavePlayerStateInput, CurrentChannel,
} from '@/lib/iptv-api'

// ============================================================
// Special group IDs for Favoritos and Recientes tabs
// ============================================================

const GROUP_FAVORITES = '__favorites__'
const GROUP_RECENTS = '__recents__'

// ============================================================
// Debounce hook (local)
// ============================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// ============================================================
// Row data type for react-window v2
// ============================================================

interface RowData {
  channels: Channel[]
  currentChannel: { name: string; url: string; logo: string; group?: string } | null
  isPlaying: boolean
  favorites: Favorite[]
  playChannel: (ch: { name: string; url: string; logo: string; group?: string }) => void
  toggleFavorite: (ch: { name: string; url: string; logo: string; group?: string }, e: React.MouseEvent) => void
}

// ============================================================
// Row component (outside main component for react-window v2)
// ============================================================

function ChannelRow({ index, style, channels, currentChannel, isPlaying, favorites, playChannel, toggleFavorite }: {
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: React.CSSProperties
} & RowData) {
  const ch = channels[index]
  if (!ch) return null

  const isFav = favorites.some(f => f.channelUrl === ch.url)
  const isActive = currentChannel?.url === ch.url
  const ITEM_HEIGHT = 48

  return (
    <div
      style={{ ...style, height: ITEM_HEIGHT }}
      className={`w-full flex items-center gap-3 px-4 transition-colors ${
        isActive
          ? 'bg-amber-500/10 border-l-2 border-amber-500'
          : 'hover:bg-white/[0.03] border-l-2 border-transparent'
      }`}
    >
      {/* Favorite heart */}
      <button
        onClick={(e) => toggleFavorite(ch, e)}
        className={`shrink-0 transition-colors ${
          isFav ? 'text-rose-400' : 'text-white/15 hover:text-white/40'
        }`}
        title={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
      </button>

      {/* Channel button */}
      <button
        onClick={() => playChannel(ch)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        {ch.logo ? (
          <img
            src={ch.logo}
            alt=""
            className="w-8 h-8 rounded object-contain bg-white/[0.06] shrink-0"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
            <Tv className="w-4 h-4 text-white/20" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-medium truncate ${
            isActive ? 'text-amber-400' : 'text-white/80'
          }`}>
            {ch.name}
          </p>
          <p className="text-[10px] text-white/30 truncate">{ch.group}</p>
        </div>
        {isActive && isPlaying && (
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="w-0.5 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="w-0.5 h-3 bg-amber-500 rounded-full animate-pulse [animation-delay:0.15s]" />
            <span className="w-0.5 h-1.5 bg-amber-500 rounded-full animate-pulse [animation-delay:0.3s]" />
          </div>
        )}
      </button>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export function IptvPlayer() {
  // --- Core state ---
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentChannel, setCurrentChannel] = useState<{ name: string; url: string; logo: string; group?: string } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playerError, setPlayerError] = useState('')
  const [useProxy, setUseProxy] = useState(false)

  // --- Saved playlist loading state ---
  const [loadPlaylistId, setLoadPlaylistId] = useState<string | null>(null)

  // --- TanStack Query hooks ---
  const { data: playlistsData } = usePlaylists()
  const { data: loadedPlaylist } = usePlaylist(loadPlaylistId)
  const savePlaylistMutation = useSavePlaylist()
  const deletePlaylistMutation = useDeletePlaylist()
  const { data: favoritesData } = useFavorites()
  const addFavoriteMutation = useAddFavorite()
  const removeFavoriteMutation = useRemoveFavorite()
  const { data: historyData } = useHistory()
  const addHistoryMutation = useAddHistory()
  const savePlayerStateMutation = useSavePlayerState()
  const { data: resumeData, isLoading: resumeLoading } = useResumeState()

  // --- Derived data ---
  const playlists: PlaylistSummary[] = playlistsData?.playlists ?? []
  const favorites: Favorite[] = favoritesData?.favorites ?? []
  const history: HistoryEntry[] = historyData?.history ?? []

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<unknown>(null)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const retryCountRef = useRef(0)
  const listRef = useListRef(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeAttemptedRef = useRef(false)

  const MAX_RETRIES = 2

  // Debounced search
  const debouncedSearch = useDebounce(searchQuery, 300)

  // ============================================================
  // HLS cleanup helper (proper)
  // ============================================================

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      const hls = hlsRef.current as { stopLoad: () => void; detachMedia: () => void; destroy: () => void }
      try { hls.stopLoad() } catch { /* ignore */ }
      try { hls.detachMedia() } catch { /* ignore */ }
      try { hls.destroy() } catch { /* ignore */ }
      hlsRef.current = null
    }
  }, [])

  // ============================================================
  // Clear loading timeout
  // ============================================================

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }
  }, [])

  // ============================================================
  // Debounced player state save (2s)
  // ============================================================

  const debouncedSaveState = useCallback((params: SavePlayerStateInput) => {
    if (stateSaveTimerRef.current) {
      clearTimeout(stateSaveTimerRef.current)
    }
    stateSaveTimerRef.current = setTimeout(() => {
      savePlayerStateMutation.mutate(params)
    }, 2000)
  }, [savePlayerStateMutation])

  // ============================================================
  // Resume state on mount
  // ============================================================

  useEffect(() => {
    if (resumeLoading || resumeAttemptedRef.current) return
    if (!resumeData) return

    resumeAttemptedRef.current = true

    if (resumeData.playerState) {
      const ps = resumeData.playerState
      setVolume(ps.volume)
      setIsMuted(ps.isMuted)
      setUseProxy(ps.useProxy)
      setSelectedGroup(ps.selectedGroup || 'all')
      if (ps.playlistUrl) {
        setPlaylistUrl(ps.playlistUrl)
      }

      const video = videoRef.current
      if (video) {
        video.volume = ps.volume
        video.muted = ps.isMuted
      }
    }

    if (resumeData.lastPlaylist) {
      const lp = resumeData.lastPlaylist
      if (lp.channels && Array.isArray(lp.channels) && lp.channels.length > 0) {
        setChannels(lp.channels)
        setGroups(lp.groups || [])
        toast.success(`${lp.channels.length} canales restaurados`)
      }

      if (resumeData.playerState?.currentChannel && typeof resumeData.playerState.currentChannel === 'object') {
        const ch = resumeData.playerState.currentChannel
        if (ch.url) {
          setTimeout(() => {
            playChannelRef.current(ch)
          }, 500)
        }
      }
    }
  }, [resumeData, resumeLoading])

  // ============================================================
  // Load a saved playlist when query resolves
  // ============================================================

  useEffect(() => {
    if (!loadPlaylistId || !loadedPlaylist) return
    setChannels(loadedPlaylist.channels)
    setGroups(loadedPlaylist.groups || [])
    setSelectedGroup('all')
    setPlaylistUrl(loadedPlaylist.url)
    setCurrentChannel(null)
    setIsPlaying(false)
    setPlayerError('')
    destroyHls()
    toast.success(`${loadedPlaylist.channels.length} canales cargados desde guardado`)
    debouncedSaveState({ playlistUrl: loadedPlaylist.url })
    setLoadPlaylistId(null)
  }, [loadPlaylistId, loadedPlaylist, destroyHls, debouncedSaveState])

  // ============================================================
  // Cleanup on unmount
  // ============================================================

  useEffect(() => {
    return () => {
      destroyHls()
      clearLoadingTimeout()
      if (stateSaveTimerRef.current) {
        clearTimeout(stateSaveTimerRef.current)
      }
      if (abortRef.current) {
        abortRef.current.abort()
      }
      const video = videoRef.current
      if (video) {
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [destroyHls, clearLoadingTimeout])

  // ============================================================
  // playChannel
  // ============================================================

  const playChannel = useCallback((channel: { name: string; url: string; logo: string; group?: string }) => {
    const video = videoRef.current
    if (!video) return

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    destroyHls()
    clearLoadingTimeout()

    video.removeAttribute('src')
    video.load()

    setCurrentChannel(channel)
    setIsPlaying(false)
    setPlayerError('')
    retryCountRef.current = 0

    loadingTimeoutRef.current = setTimeout(() => {
      setPlayerError('Canal no disponible en este momento')
      setIsPlaying(false)
    }, 15000)

    const streamUrl = channel.url

    const isLikelyHLS = streamUrl.includes('.m3u8') ||
      streamUrl.includes('/live/') ||
      streamUrl.includes('type=m3u_plus') ||
      streamUrl.includes('get.php') ||
      streamUrl.includes('/stream/') ||
      streamUrl.includes('format=m3u8')

    const isLikelyDirectStream = streamUrl.includes('.ts') ||
      streamUrl.includes('.mp4') ||
      streamUrl.includes('.mkv') ||
      streamUrl.includes('.avi') ||
      streamUrl.includes('.flv') ||
      streamUrl.includes('.mov')

    addHistoryMutation.mutate({
      channelName: channel.name,
      channelUrl: channel.url,
      channelLogo: channel.logo,
      channelGroup: channel.group || '',
    })

    debouncedSaveState({ currentChannel: channel as CurrentChannel })

    const tryDirectHLS = () => {
      if (typeof window === 'undefined') return

      import('hls.js').then(({ default: Hls }) => {
        if (abortRef.current?.signal.aborted) return

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 10,
            maxMaxBufferLength: 30,
            backBufferLength: 10,
            startLevel: -1,
            progressive: true,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            maxBufferHole: 0.5,
            startFragPrefetch: true,
          })
          hlsRef.current = hls

          hls.loadSource(streamUrl)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            clearLoadingTimeout()
            video.play().catch(() => {})
            setIsPlaying(true)
            setUseProxy(false)
            debouncedSaveState({ useProxy: false })
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (retryCountRef.current < MAX_RETRIES) {
                    retryCountRef.current++
                    hls.startLoad()
                  } else {
                    destroyHls()
                    retryCountRef.current = 0
                    tryProxyHLS()
                  }
                  break
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError()
                  break
                default:
                  destroyHls()
                  tryProxyHLS()
                  break
              }
            }
          })
        } else {
          tryNativeOrDirect()
        }
      })
    }

    const tryProxyHLS = () => {
      if (typeof window === 'undefined') return

      import('hls.js').then(({ default: Hls }) => {
        if (abortRef.current?.signal.aborted) return

        if (Hls.isSupported()) {
          const proxyUrl = `/api/iptv/stream?url=${encodeURIComponent(streamUrl)}`
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 10,
            maxMaxBufferLength: 30,
            backBufferLength: 10,
            startLevel: -1,
            progressive: true,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            maxBufferHole: 0.5,
            startFragPrefetch: true,
          })
          hlsRef.current = hls

          hls.loadSource(proxyUrl)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            clearLoadingTimeout()
            video.play().catch(() => {})
            setIsPlaying(true)
            setUseProxy(true)
            debouncedSaveState({ useProxy: true })
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (retryCountRef.current < MAX_RETRIES) {
                    retryCountRef.current++
                    hls.startLoad()
                  } else {
                    destroyHls()
                    clearLoadingTimeout()
                    setPlayerError('No se pudo conectar al servidor')
                  }
                  break
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError()
                  break
                default:
                  destroyHls()
                  clearLoadingTimeout()
                  setPlayerError('Formato no soportado por tu navegador')
                  break
              }
            }
          })
        } else {
          tryNativeOrDirect()
        }
      })
    }

    const tryDirectPlayback = () => {
      video.src = streamUrl
      video.play().then(() => {
        clearLoadingTimeout()
        setIsPlaying(true)
        setUseProxy(false)
      }).catch(() => {
        video.src = `/api/iptv/stream?url=${encodeURIComponent(streamUrl)}`
        video.play().then(() => {
          clearLoadingTimeout()
          setIsPlaying(true)
          setUseProxy(true)
          debouncedSaveState({ useProxy: true })
        }).catch(() => {
          clearLoadingTimeout()
          setPlayerError('Formato no soportado por tu navegador')
        })
      })
    }

    const tryNativeOrDirect = () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl
        video.play().then(() => {
          clearLoadingTimeout()
          setIsPlaying(true)
        }).catch(() => tryDirectPlayback())
      } else {
        tryDirectPlayback()
      }
    }

    if (isLikelyDirectStream && !isLikelyHLS) {
      tryDirectPlayback()
    } else {
      tryDirectHLS()
    }
  }, [destroyHls, clearLoadingTimeout, addHistoryMutation, debouncedSaveState])

  // Ref for playChannel so resume can call it
  const playChannelRef = useRef(playChannel)
  playChannelRef.current = playChannel

  // ============================================================
  // loadPlaylist — fetch + auto-save
  // ============================================================

  const loadPlaylist = useCallback(async () => {
    if (!playlistUrl.trim()) {
      toast.error('Ingresa una URL de lista M3U')
      return
    }

    setIsLoading(true)
    setChannels([])
    setGroups([])
    setCurrentChannel(null)
    setIsPlaying(false)
    setPlayerError('')
    destroyHls()

    try {
      const res = await fetch('/api/iptv/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: playlistUrl.trim() }),
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      const allChannels: Channel[] = data.channels || []
      const allGroups: string[] = data.groups || []
      setGroups(allGroups)
      setSelectedGroup('all')
      setChannels(allChannels)

      toast.success(`${data.total} canales cargados`)

      savePlaylistMutation.mutate({
        url: playlistUrl.trim(),
        channels: allChannels,
        groups: allGroups,
      })

      debouncedSaveState({ playlistUrl: playlistUrl.trim() })

    } catch {
      toast.error('Error al cargar la lista')
    } finally {
      setIsLoading(false)
    }
  }, [playlistUrl, destroyHls, savePlaylistMutation, debouncedSaveState])

  // ============================================================
  // Delete a saved playlist
  // ============================================================

  const handleDeletePlaylist = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deletePlaylistMutation.mutate(id)
    toast.success('Lista eliminada')
  }, [deletePlaylistMutation])

  // ============================================================
  // Toggle favorite
  // ============================================================

  const toggleFavorite = useCallback((channel: { name: string; url: string; logo: string; group?: string }, e: React.MouseEvent) => {
    e.stopPropagation()
    const isFav = favorites.some(f => f.channelUrl === channel.url)
    if (isFav) {
      removeFavoriteMutation.mutate({ channelUrl: channel.url })
      toast.success('Eliminado de favoritos')
    } else {
      addFavoriteMutation.mutate({
        channelName: channel.name,
        channelUrl: channel.url,
        channelLogo: channel.logo,
        channelGroup: channel.group || '',
      } as AddFavoriteInput)
      toast.success('Agregado a favoritos')
    }
  }, [favorites, addFavoriteMutation, removeFavoriteMutation])

  // ============================================================
  // Player controls
  // ============================================================

  const stopStream = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    destroyHls()
    clearLoadingTimeout()
    setIsPlaying(false)
    setCurrentChannel(null)
    setPlayerError('')
    setUseProxy(false)
    debouncedSaveState({ currentChannel: undefined, useProxy: false })
  }, [destroyHls, clearLoadingTimeout, debouncedSaveState])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
    debouncedSaveState({ isMuted: video.muted })
  }, [debouncedSaveState])

  const handleVolume = useCallback((v: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = v
    setVolume(v)
    debouncedSaveState({ volume: v })
  }, [debouncedSaveState])

  // ============================================================
  // Fullscreen — cross-browser + Android landscape lock
  // ============================================================

  const requestFullscreen = useCallback(async (el: HTMLElement) => {
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen()
      } else if ((el as any).mozRequestFullScreen) {
        await (el as any).mozRequestFullScreen()
      } else if ((el as any).msRequestFullscreen) {
        await (el as any).msRequestFullscreen()
      }
      // Lock landscape on Android
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape')
        }
      } catch {
        // orientation lock not supported or not allowed
      }
    } catch {
      // fullscreen denied
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen()
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen()
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen()
      }
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock()
        }
      } catch {
        // ignore
      }
    } catch {
      // exit failed
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current
    if (!container) return
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    )
    if (isCurrentlyFullscreen) {
      exitFullscreen()
    } else {
      requestFullscreen(container)
    }
  }, [requestFullscreen, exitFullscreen])

  // Sync fullscreen state with browser events
  useEffect(() => {
    const handleChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      )
      setIsFullscreen(isCurrentlyFullscreen)
    }
    document.addEventListener('fullscreenchange', handleChange)
    document.addEventListener('webkitfullscreenchange', handleChange)
    document.addEventListener('mozfullscreenchange', handleChange)
    document.addEventListener('MSFullscreenChange', handleChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
      document.removeEventListener('webkitfullscreenchange', handleChange)
      document.removeEventListener('mozfullscreenchange', handleChange)
      document.removeEventListener('MSFullscreenChange', handleChange)
    }
  }, [])

  // ============================================================
  // Retry on error
  // ============================================================

  const retryChannel = useCallback(() => {
    if (currentChannel) {
      playChannel(currentChannel)
    }
  }, [currentChannel, playChannel])

  // ============================================================
  // Filtered channels — includes Favoritos and Recientes tabs
  // ============================================================

  const favoriteChannels = useMemo(() => {
    return favorites.map(f => ({
      name: f.channelName,
      url: f.channelUrl,
      logo: f.channelLogo,
      group: f.channelGroup,
      tvgId: '',
    }))
  }, [favorites])

  const recentChannels = useMemo(() => {
    return history.map(h => ({
      name: h.channelName,
      url: h.channelUrl,
      logo: h.channelLogo,
      group: h.channelGroup,
      tvgId: '',
    }))
  }, [history])

  const filteredChannels = useMemo(() => {
    if (selectedGroup === GROUP_FAVORITES) {
      return favoriteChannels.filter(ch => {
        if (!debouncedSearch) return true
        return ch.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      })
    }
    if (selectedGroup === GROUP_RECENTS) {
      return recentChannels.filter(ch => {
        if (!debouncedSearch) return true
        return ch.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      })
    }

    return channels.filter(ch => {
      const matchGroup = selectedGroup === 'all' || ch.group === selectedGroup
      const matchSearch = !debouncedSearch || ch.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      return matchGroup && matchSearch
    })
  }, [channels, selectedGroup, debouncedSearch, favoriteChannels, recentChannels])

  // Group counts
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    counts.set('all', channels.length)
    for (const ch of channels) {
      counts.set(ch.group, (counts.get(ch.group) || 0) + 1)
    }
    counts.set(GROUP_FAVORITES, favoriteChannels.length)
    counts.set(GROUP_RECENTS, recentChannels.length)
    return counts
  }, [channels, favoriteChannels, recentChannels])

  // Row data for react-window v2
  const rowData: RowData = useMemo(() => ({
    channels: filteredChannels,
    currentChannel,
    isPlaying,
    favorites,
    playChannel,
    toggleFavorite,
  }), [filteredChannels, currentChannel, isPlaying, favorites, playChannel, toggleFavorite])

  const ITEM_HEIGHT = 48

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Playlist URL Input + Saved Playlists */}
      <div className="bg-[#111113] rounded-xl border border-white/[0.06] p-4 space-y-3">
        <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Lista M3U / M3U Plus</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="http://server:port/get.php?username=USER&password=PASS&type=m3u_plus"
            className="flex-1 bg-[#09090b] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono transition-colors"
          />
          <button
            onClick={loadPlaylist}
            disabled={isLoading}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center gap-2 shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Cargar
          </button>
        </div>

        {/* Saved Playlists Quick-Load */}
        {playlists.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider">
              <ListVideo className="w-3 h-3" />
              Listas guardadas
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
              {playlists.map(pl => (
                <div
                  key={pl.id}
                  onClick={() => setLoadPlaylistId(pl.id)}
                  className="group flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors"
                >
                  <ListVideo className="w-3 h-3 text-white/30 shrink-0" />
                  <span className="text-[10px] text-white/60 truncate max-w-[120px]">
                    {pl.name || pl.url.replace(/^https?:\/\//, '').split('/')[0]}
                  </span>
                  <span className="text-[9px] text-white/25 shrink-0">
                    {pl.channelCount}ch
                  </span>
                  <button
                    onClick={(e) => handleDeletePlaylist(pl.id, e)}
                    className="text-white/10 hover:text-red-400 transition-colors shrink-0"
                    title="Eliminar lista"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Video Player */}
      <div
        ref={playerContainerRef}
        className={`bg-[#111113] rounded-xl border border-white/[0.06] overflow-hidden ${
          isFullscreen ? 'flex flex-col bg-black' : ''
        }`}
      >
        <div className={`relative bg-black ${isFullscreen ? 'flex-1' : 'aspect-video'}`} onDoubleClick={toggleFullscreen}>
          <video
            ref={videoRef}
            className={`w-full h-full ${isFullscreen ? 'object-contain' : ''}`}
            playsInline
          />
          {/* Fullscreen button overlay — center of video when playing */}
          {isPlaying && !isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 p-2 rounded-lg transition-all opacity-0 hover:opacity-100 group-hover:opacity-100"
              style={{ opacity: 0.7 }}
              title="Pantalla completa"
            >
              <Maximize className="w-4 h-4 text-white/80" />
            </button>
          )}
          {!isPlaying && !currentChannel && !playerError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Tv className="w-12 h-12 text-white/15" />
            </div>
          )}
          {currentChannel && !isPlaying && !playerError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          )}
          {playerError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center space-y-3">
                <Info className="w-8 h-8 text-red-400/60 mx-auto" />
                <p className="text-xs text-red-400/80">{playerError}</p>
                <button
                  onClick={retryChannel}
                  className="inline-flex items-center gap-1.5 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-md transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls bar */}
        {currentChannel && (
          <div className={`flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06] ${
            isFullscreen
              ? 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent border-t-0 py-3 z-10'
              : ''
          }`}>
            <span className="text-xs text-white/40 truncate flex-1 font-medium">{currentChannel.name}</span>
            {useProxy && (
              <span className="text-[9px] text-amber-500/50 shrink-0">PROXY</span>
            )}
            <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolume(parseFloat(e.target.value))}
              className="w-20 h-1 accent-amber-500"
            />
            <button onClick={toggleFullscreen} className={`text-white/70 hover:text-white transition-colors ${isFullscreen ? 'p-1' : ''}`} title={isFullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}>
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-4 h-4" />}
            </button>
            <button onClick={stopStream} className="text-red-400 hover:text-red-300 transition-colors">
              <Square className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Channel List */}
      {(channels.length > 0 || favorites.length > 0 || history.length > 0) && (
        <div className="bg-[#111113] rounded-xl border border-white/[0.06] overflow-hidden">
          {/* Header with search and group filter */}
          <div className="p-3 border-b border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
                {filteredChannels.length} canales
              </span>
            </div>
            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal..."
              className="w-full bg-[#09090b] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            {/* Group pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              <button
                onClick={() => setSelectedGroup('all')}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  selectedGroup === 'all' ? 'bg-amber-500 text-black' : 'bg-white/[0.06] text-white/50 hover:text-white/70'
                }`}
              >
                Todos ({groupCounts.get('all') || 0})
              </button>
              <button
                onClick={() => setSelectedGroup(GROUP_FAVORITES)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all flex items-center gap-1 ${
                  selectedGroup === GROUP_FAVORITES ? 'bg-rose-500 text-white' : 'bg-white/[0.06] text-white/50 hover:text-white/70'
                }`}
              >
                <Heart className="w-2.5 h-2.5" />
                Favoritos ({groupCounts.get(GROUP_FAVORITES) || 0})
              </button>
              <button
                onClick={() => setSelectedGroup(GROUP_RECENTS)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all flex items-center gap-1 ${
                  selectedGroup === GROUP_RECENTS ? 'bg-sky-500 text-white' : 'bg-white/[0.06] text-white/50 hover:text-white/70'
                }`}
              >
                <Clock className="w-2.5 h-2.5" />
                Recientes ({groupCounts.get(GROUP_RECENTS) || 0})
              </button>
              {groups.slice(0, 17).map(g => (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(g)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                    selectedGroup === g ? 'bg-amber-500 text-black' : 'bg-white/[0.06] text-white/50 hover:text-white/70'
                  }`}
                >
                  {g} ({groupCounts.get(g) || 0})
                </button>
              ))}
              {groups.length > 17 && (
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="shrink-0 bg-white/[0.06] text-white/50 text-[10px] rounded-full px-2 py-1 border-0 focus:outline-none"
                >
                  <option value="all">Más...</option>
                  {groups.map(g => (
                    <option key={g} value={g}>{g} ({groupCounts.get(g) || 0})</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Channel list — react-window v2 virtual scrolling */}
          {filteredChannels.length === 0 ? (
            <div className="p-6 text-center text-white/30 text-xs">
              {selectedGroup === GROUP_FAVORITES
                ? 'No tienes canales favoritos aún'
                : selectedGroup === GROUP_RECENTS
                  ? 'No hay canales recientes'
                  : 'No se encontraron canales'
              }
            </div>
          ) : (
            <List
              listRef={listRef}
              rowComponent={ChannelRow}
              rowCount={filteredChannels.length}
              rowHeight={ITEM_HEIGHT}
              rowProps={rowData}
              overscanCount={10}
              style={{ height: Math.min(400, typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400) }}
            />
          )}
        </div>
      )}
    </div>
  )
}
