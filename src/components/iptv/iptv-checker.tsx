'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Play, Square, Loader2, Upload, ExternalLink,
  RotateCcw, History, ChevronDown, ChevronUp, X
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import {
  useCreateJob,
  useCancelJob,
  useJobResults,
  useResumeState,
} from '@/hooks/use-iptv'
import type {
  Job,
  JobResult,
  ProcessBatchResult,
} from '@/lib/iptv-api'

// ============================================================
// Types
// ============================================================

interface IptvResult {
  id: string
  url: string
  status: 'hit' | 'bad' | 'timeout' | 'checking'
  host?: string
  username?: string
  password?: string
  info?: {
    status?: string
    active_cons?: string
    max_connections?: string
    created_at?: string
    exp_date?: string
    timezone?: string
    channels?: string
    films?: string
    series?: string
    real_url?: string
    real_port?: string
    m3u_url?: string
    [key: string]: unknown
  }
}

interface CompletedJob {
  id: string
  inputMode: string
  serverHost: string
  status: string
  totalLines: number
  processed: number
  hits: number
  bad: number
  timeout: number
  createdAt: string
  completedAt: string | null
}

// ============================================================
// Animated stat number component
// ============================================================

function AnimatedStat({ value, color }: { value: number; color: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.5, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`text-base font-bold font-mono ${color}`}
    >
      {value}
    </motion.span>
  )
}

// ============================================================
// Main Component
// ============================================================

export function IptvChecker() {
  // ---- Form state ----
  const [comboList, setComboList] = useState('')
  const [serverHost, setServerHost] = useState('')
  const [threads, setThreads] = useState('5')
  const [inputMode, setInputMode] = useState<'url' | 'combo'>('url')
  const [fileName, setFileName] = useState('')
  const [lineCount, setLineCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- Job state ----
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [results, setResults] = useState<IptvResult[]>([])
  const [stats, setStats] = useState({ total: 0, hits: 0, bad: 0, timeout: 0, totalLines: 0 })
  const [progress, setProgress] = useState(0)
  const stopRef = useRef(false)
  const resultsRef = useRef<IptvResult[]>([])
  const statsRef = useRef(stats)
  const pollingRef = useRef(false)

  // ---- Job history state ----
  const [showHistory, setShowHistory] = useState(false)
  const [viewingJobId, setViewingJobId] = useState<string | null>(null)

  // ---- Hooks ----
  const createJob = useCreateJob()
  const cancelJob = useCancelJob(currentJobId)
  const resumeState = useResumeState()
  const viewJobResults = useJobResults(viewingJobId, 'hit')

  // ---- Completed jobs query ----
  const { data: completedJobsData } = useQuery<CompletedJob[]>({
    queryKey: ['iptv', 'completedJobs', isRunning],
    queryFn: async () => {
      const res = await fetch('/api/iptv/jobs?includeCompleted=true')
      if (!res.ok) return []
      const data = await res.json()
      return (data.jobs || []).filter(
        (j: Job) => j.status === 'completed' || j.status === 'cancelled'
      )
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
  const completedJobs = completedJobsData || []

  // ---- Keep refs in sync ----
  useEffect(() => {
    resultsRef.current = results
  }, [results])
  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  // ---- Polling via direct fetch (works for both new jobs and resumed jobs) ----
  const startPollingWithJobId = useCallback((jobId: string) => {
    if (pollingRef.current) return
    pollingRef.current = true
    stopRef.current = false

    const pollJob = async () => {
      while (!stopRef.current) {
        try {
          const concurrency = parseInt(threads) || 5
          const res = await fetch(`/api/iptv/jobs/${jobId}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threads: concurrency }),
          })
          if (!res.ok) {
            await new Promise(r => setTimeout(r, 2000))
            continue
          }
          const result: ProcessBatchResult = await res.json()

          // Map batch results to IptvResult
          const batchIptvResults: IptvResult[] = (result.results || []).map(
            (r: ProcessBatchResult['results'][number], idx: number) => ({
              id: `job-${jobId}-${Date.now()}-${idx}`,
              url: r.url || r.line,
              status: r.status as IptvResult['status'],
              host: r.host,
              username: r.username,
              password: r.password,
              info: (r.info as IptvResult['info']) || undefined,
            })
          )

          // Update accumulated results
          const newResults = [...resultsRef.current, ...batchIptvResults]
          resultsRef.current = newResults
          setResults(newResults)

          // Update stats from server (source of truth)
          const newStats = {
            total: result.processed,
            hits: result.hits,
            bad: result.bad,
            timeout: result.timeout,
            totalLines: result.totalLines,
          }
          statsRef.current = newStats
          setStats(newStats)
          setProgress(result.progress)

          // Check if done
          if (result.status === 'completed' || result.status === 'cancelled') {
            setIsRunning(false)
            setIsResuming(false)
            pollingRef.current = false
            if (result.status === 'completed') {
              toast.success(`Verificación completada: ${result.hits} hits`)
            }
            return
          }
        } catch {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }

        await new Promise(r => setTimeout(r, 500))
      }

      setIsRunning(false)
      setIsResuming(false)
      pollingRef.current = false
    }

    pollJob()
  }, [threads])

  // ---- Resume detection ----
  const resumeAttemptedRef = useRef(false)
  useEffect(() => {
    if (!resumeState.data || resumeAttemptedRef.current) return
    const { activeJobs: jobs } = resumeState.data
    if (jobs && jobs.length > 0 && !currentJobId && !isRunning) {
      resumeAttemptedRef.current = true
      const job = jobs[0]
      // Use a microtask to defer state updates outside the effect body
      queueMicrotask(() => {
        setCurrentJobId(job.id)
        setIsResuming(true)
        setIsRunning(true)
        setStats({
          total: job.processed,
          hits: job.hits,
          bad: job.bad,
          timeout: job.timeout,
          totalLines: job.totalLines,
        })
        setProgress(job.totalLines > 0 ? Math.round((job.processed / job.totalLines) * 100) : 0)
        toast.info('Reanudando verificación anterior...')
        startPollingWithJobId(job.id)
      })
    }
  }, [resumeState.data, currentJobId, isRunning, startPollingWithJobId])

  // ---- Mode switch handler (clears state via event handler, not effect) ----
  const switchMode = useCallback((mode: 'url' | 'combo') => {
    if (isRunning) return
    setInputMode(mode)
    setResults([])
    setStats({ total: 0, hits: 0, bad: 0, timeout: 0, totalLines: 0 })
    setProgress(0)
    setComboList('')
    setFileName('')
    setLineCount(0)
    setCurrentJobId(null)
    stopRef.current = false
  }, [isRunning])

  // ---- File upload handler ----
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.txt')) {
      toast.error('Solo archivos .txt')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setComboList(text)
      setFileName(file.name)
      const lines = text.trim().split('\n').filter(l => l.trim())
      setLineCount(lines.length)
      toast.success(`${lines.length} combos cargados de ${file.name}`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  // ---- Start check ----
  const startCheck = useCallback(async () => {
    const allLines = comboList.trim().split('\n').filter(l => l.trim())
    if (allLines.length === 0) {
      toast.error('Carga un combo o pega líneas')
      return
    }
    if (inputMode === 'combo' && !serverHost.trim()) {
      toast.error('Ingresa el servidor (host:port)')
      return
    }

    try {
      const job = await createJob.mutateAsync({
        lines: allLines,
        inputMode,
        serverHost: serverHost.trim(),
      })

      setCurrentJobId(job.id)
      setIsRunning(true)
      setIsResuming(false)
      setResults([])
      setStats({ total: 0, hits: 0, bad: 0, timeout: 0, totalLines: job.totalLines })
      setProgress(0)
      resultsRef.current = []
      stopRef.current = false

      // Use direct fetch approach for polling (more reliable with dynamic jobId)
      startPollingWithJobId(job.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear job'
      toast.error(msg)
    }
  }, [comboList, inputMode, serverHost, createJob, startPollingWithJobId])

  // ---- Stop check ----
  const stopCheck = useCallback(async () => {
    stopRef.current = true
    if (currentJobId) {
      try {
        await cancelJob.mutateAsync({ action: 'cancel' })
        toast.info('Verificación cancelada')
      } catch {
        toast.error('Error al cancelar job')
      }
    }
    setIsRunning(false)
    setIsResuming(false)
    pollingRef.current = false
  }, [currentJobId, cancelJob])

  // ---- Derived ----
  const hitResults = results.filter(r => r.status === 'hit')
  const viewHitResults = viewJobResults.data?.results || []

  return (
    <div className="space-y-4">
      {/* Resume indicator */}
      <AnimatePresence>
        {isResuming && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4 text-amber-500 animate-spin" />
            <span className="text-xs text-amber-400 font-medium">
              Reanudando verificación anterior...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input card */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        {/* Mode selector */}
        <div className="flex bg-[#09090b] theme-input rounded-lg border border-white/[0.06] p-0.5">
          <button
            onClick={() => switchMode('url')}
            disabled={isRunning}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              inputMode === 'url' ? 'bg-amber-500 text-black' : 'text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
            }`}
          >
            URL Mode
          </button>
          <button
            onClick={() => switchMode('combo')}
            disabled={isRunning}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              inputMode === 'combo' ? 'bg-amber-500 text-black' : 'text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
            }`}
          >
            Combo Mode
          </button>
        </div>

        {/* Server host (only in combo mode) */}
        {inputMode === 'combo' && (
          <input
            type="text"
            value={serverHost}
            onChange={(e) => setServerHost(e.target.value)}
            disabled={isRunning}
            placeholder="Servidor (host:port) ej: canal-pro.xyz:8080"
            className="w-full bg-[#09090b] theme-input border border-amber-500/30 rounded-lg px-3 py-2.5 text-sm text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 font-mono transition-colors disabled:opacity-50"
          />
        )}

        {/* Textarea — only in URL mode */}
        {inputMode === 'url' && (
          <textarea
            value={comboList}
            onChange={(e) => setComboList(e.target.value)}
            disabled={isRunning}
            placeholder="http://host:port/get.php?username=USER&password=PASS"
            rows={4}
            className="w-full bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono resize-none transition-colors disabled:opacity-50"
          />
        )}

        {/* File upload only in Combo mode */}
        {inputMode === 'combo' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              className="w-full border-2 border-dashed border-white/[0.08] hover:border-amber-500/40 rounded-lg py-4 flex flex-col items-center justify-center gap-1.5 transition-colors group disabled:opacity-50"
            >
              <Upload className="w-5 h-5 text-white/30 theme-text-dim group-hover:text-amber-500/70 transition-colors" />
              <span className="text-xs text-white/40 theme-text-dim group-hover:text-white/60 theme-text-dim transition-colors">
                {fileName ? fileName : 'Subir combo .txt'}
              </span>
              {lineCount > 0 && (
                <span className="text-[10px] text-amber-500/60 font-mono">{lineCount} líneas</span>
              )}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="number"
            value={threads}
            onChange={(e) => setThreads(e.target.value)}
            min="1"
            max="20"
            placeholder="Hilos"
            disabled={isRunning}
            className="w-20 bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text focus:outline-none focus:border-amber-500/50 font-mono transition-colors disabled:opacity-50"
          />
          <button
            onClick={startCheck}
            disabled={isRunning}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Verificando...' : 'Iniciar Check'}
          </button>
          {isRunning && (
            <button
              onClick={stopCheck}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg px-3 py-2.5 text-sm transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(isRunning || stats.total > 0) && stats.totalLines > 0 && (
        <div className="space-y-1.5">
          <div className="w-full bg-[#111113] rounded-full h-1.5 overflow-hidden border border-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-white/30 theme-text-dim font-mono">
            <span>{stats.total} / {stats.totalLines} verificados</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats.total > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Total', value: stats.total, color: 'text-white theme-text' },
            { label: 'Hits', value: stats.hits, color: 'text-green-500' },
            { label: 'Bad', value: stats.bad, color: 'text-red-500' },
            { label: 'Timeout', value: stats.timeout, color: 'text-amber-500' },
          ].map(s => (
            <div key={s.label} className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-2.5 text-center">
              <AnimatedStat value={s.value} color={s.color} />
              <p className="text-[9px] text-white/40 theme-text-dim uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Hit Results */}
      {hitResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-green-500/80 uppercase tracking-wider">✓ Hits Encontrados</h3>
            <button
              onClick={() => {
                const text = hitResults.map((r, idx) => {
                  const info = r.info
                  const m3uUrl = info?.m3u_url || r.url
                  return `👑 Hit #${idx + 1}\n├ 👤 User:  ${r.username}\n├ 🔑 Pass:  ${r.password}\n├ ✅ Status:  ${info?.status || 'Active'}\n├ 📶 Active:  ${info?.active_cons || '0'}\n├ 📡 Max:   ${info?.max_connections || '0'}\n├ ⏰ Creado:  ${info?.created_at || 'N/A'}\n├ 📅 Exp:  ${info?.exp_date || 'N/A'}\n├ 🕰️ TZ:  ${info?.timezone || 'N/A'}\n└ 🔗 M3U:  ${m3uUrl}`
                }).join('\n\n')
                navigator.clipboard.writeText(text)
                toast.success(`${hitResults.length} hits copiados`)
              }}
              className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar Todo
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar">
            {hitResults.map((r, i) => {
              const info = r.info
              const m3uUrl = info?.m3u_url || r.url

              const copySingleHit = () => {
                const text = `👑 Hit\n├ 👤 User:  ${r.username}\n├ 🔑 Pass:  ${r.password}\n├ ✅ Status:  ${info?.status || 'Active'}\n├ 📶 Active:  ${info?.active_cons || '0'}\n├ 📡 Max:   ${info?.max_connections || '0'}\n├ ⏰ Creado:  ${info?.created_at || 'N/A'}\n├ 📅 Exp:  ${info?.exp_date || 'N/A'}\n├ 🕰️ TZ:  ${info?.timezone || 'N/A'}\n└ 🔗 M3U:  ${m3uUrl}`
                navigator.clipboard.writeText(text)
                toast.success('Hit copiado')
              }

              return (
                <motion.div
                  key={`hit-${i}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative overflow-hidden rounded-xl border border-green-500/20"
                >
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />

                  <div className="p-3.5" style={{ background: 'linear-gradient(to bottom right, rgba(34,197,94,0.07), rgba(16,185,129,0.03))' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">👑</span>
                      <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Hit #{i + 1}</span>
                      <div className="flex-1" />
                      <button
                        onClick={copySingleHit}
                        className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                        title="Copiar hit"
                      >
                        <Copy className="w-3.5 h-3.5 text-green-500/60" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                      <div><span className="text-white/30 theme-text-dim">👤 </span><span className="text-green-300">{r.username}</span></div>
                      <div><span className="text-white/30 theme-text-dim">🔑 </span><span className="text-green-300">{r.password}</span></div>
                      <div><span className="text-white/30 theme-text-dim">✅ </span><span className="text-white/70 theme-text">{info?.status || 'Active'}</span></div>
                      <div><span className="text-white/30 theme-text-dim">📶 </span><span className="text-white/70 theme-text">{info?.active_cons || '0'} / {info?.max_connections || '0'}</span></div>
                      <div><span className="text-white/30 theme-text-dim">⏰ </span><span className="text-white/70 theme-text">{info?.created_at || 'N/A'}</span></div>
                      <div><span className="text-white/30 theme-text-dim">📅 </span><span className="text-white/70 theme-text">{info?.exp_date || 'N/A'}</span></div>
                      {info?.timezone && (
                        <div className="col-span-2"><span className="text-white/30 theme-text-dim">🕰️ </span><span className="text-white/70 theme-text">{info.timezone}</span></div>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(m3uUrl); toast.success('M3U URL copiada') }}
                        className="flex items-center gap-1 text-[10px] bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2 py-1 rounded-md transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        M3U Link
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Job History */}
      {completedJobs.length > 0 && !isRunning && (
        <div className="space-y-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs text-white/40 theme-text-dim hover:text-white/60 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            Historial ({completedJobs.length})
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                  {completedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="bg-[#111113] rounded-xl border border-white/[0.06] p-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            job.status === 'completed' ? 'text-green-500' : 'text-red-400'
                          }`}>
                            {job.status === 'completed' ? '✓' : '✗'}
                          </span>
                          <span className="text-xs text-white/70 theme-text font-mono truncate">
                            {job.inputMode === 'url' ? 'URL Mode' : `Combo: ${job.serverHost}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30 font-mono">
                          <span>{job.totalLines} líneas</span>
                          <span className="text-green-500/60">{job.hits} hits</span>
                          <span className="text-red-500/60">{job.bad} bad</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setViewingJobId(job.id === viewingJobId ? null : job.id)}
                        className="text-[10px] bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white/80 px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 shrink-0"
                      >
                        {job.id === viewingJobId ? <X className="w-3 h-3" /> : null}
                        {job.id === viewingJobId ? 'Cerrar' : 'Ver resultados'}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Viewing historical job results */}
      <AnimatePresence>
        {viewingJobId && viewHitResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-green-500/80 uppercase tracking-wider">
                ✓ Hits del Job Anterior
              </h3>
              <button
                onClick={() => {
                  const text = viewHitResults.map((r: JobResult, idx: number) => {
                    const info = r.info as IptvResult['info'] | null
                    const m3uUrl = info?.m3u_url || r.url
                    return `👑 Hit #${idx + 1}\n├ 👤 User:  ${r.username}\n├ 🔑 Pass:  ${r.password}\n├ ✅ Status:  ${info?.status || 'Active'}\n├ 📶 Active:  ${info?.active_cons || '0'}\n├ 📡 Max:   ${info?.max_connections || '0'}\n├ ⏰ Creado:  ${info?.created_at || 'N/A'}\n├ 📅 Exp:  ${info?.exp_date || 'N/A'}\n└ 🔗 M3U:  ${m3uUrl}`
                  }).join('\n\n')
                  navigator.clipboard.writeText(text)
                  toast.success(`${viewHitResults.length} hits copiados`)
                }}
                className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Todo
              </button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-3 custom-scrollbar">
              {viewHitResults.map((r: JobResult, i: number) => {
                const info = r.info as IptvResult['info'] | null
                const m3uUrl = info?.m3u_url || r.url

                return (
                  <motion.div
                    key={`hist-${r.id}`}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative overflow-hidden rounded-xl border border-green-500/20"
                  >
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />

                    <div className="p-3.5" style={{ background: 'linear-gradient(to bottom right, rgba(34,197,94,0.07), rgba(16,185,129,0.03))' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">👑</span>
                        <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Hit #{i + 1}</span>
                        <div className="flex-1" />
                        <button
                          onClick={() => {
                            const text = `👑 Hit\n├ 👤 User:  ${r.username}\n├ 🔑 Pass:  ${r.password}\n├ ✅ Status:  ${info?.status || 'Active'}\n├ 📶 Active:  ${info?.active_cons || '0'}\n├ 📡 Max:   ${info?.max_connections || '0'}\n├ ⏰ Creado:  ${info?.created_at || 'N/A'}\n├ 📅 Exp:  ${info?.exp_date || 'N/A'}\n└ 🔗 M3U:  ${m3uUrl}`
                            navigator.clipboard.writeText(text)
                            toast.success('Hit copiado')
                          }}
                          className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                          title="Copiar hit"
                        >
                          <Copy className="w-3.5 h-3.5 text-green-500/60" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                        <div><span className="text-white/30 theme-text-dim">👤 </span><span className="text-green-300">{r.username}</span></div>
                        <div><span className="text-white/30 theme-text-dim">🔑 </span><span className="text-green-300">{r.password}</span></div>
                        <div><span className="text-white/30 theme-text-dim">✅ </span><span className="text-white/70 theme-text">{info?.status || 'Active'}</span></div>
                        <div><span className="text-white/30 theme-text-dim">📶 </span><span className="text-white/70 theme-text">{info?.active_cons || '0'} / {info?.max_connections || '0'}</span></div>
                        <div><span className="text-white/30 theme-text-dim">⏰ </span><span className="text-white/70 theme-text">{info?.created_at || 'N/A'}</span></div>
                        <div><span className="text-white/30 theme-text-dim">📅 </span><span className="text-white/70 theme-text">{info?.exp_date || 'N/A'}</span></div>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(m3uUrl); toast.success('M3U URL copiada') }}
                          className="flex items-center gap-1 text-[10px] bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2 py-1 rounded-md transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          M3U Link
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
