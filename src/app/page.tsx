'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, Search, Tv, Mail, Settings, Copy, Check, Play, Pause,
  Volume2, VolumeX, Trash2, RefreshCw, ChevronDown, Info, Moon, Sun,
  X, Loader2, Square, Send, ExternalLink, Zap, Globe, Upload
} from 'lucide-react'
import { toast } from 'sonner'

// ============================================================
// TYPES
// ============================================================

type TabId = 'cards' | 'checker' | 'iptv' | 'email' | 'settings'

interface GeneratedCard {
  number: string
  month: string
  year: string
  cvv: string
  type: string
}

interface CheckResult {
  cc: string
  status: 'live' | 'dead' | 'checking' | 'error'
  message?: string
  brand?: string
  bank?: string
}

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

interface EmailAccount {
  address: string
  token: string
  id: string
  provider: string
}

interface EmailMessage {
  id: string
  from: { address: string; name: string }
  subject: string
  createdAt: string
  intro?: string
}

// ============================================================
// LUHN ALGORITHM
// ============================================================

function luhnCheckDigit(digits: string): number {
  let sum = 0
  let alternate = true
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return (10 - (sum % 10)) % 10
}

function generateCardFromBin(bin: string, cardType: string, customMonth?: string, customYear?: string): GeneratedCard {
  // Replace 'x' or 'X' with random digits
  let base = ''
  for (const ch of bin) {
    if (ch === 'x' || ch === 'X') {
      base += Math.floor(Math.random() * 10).toString()
    } else if (/\d/.test(ch)) {
      base += ch
    }
  }

  // Determine card length based on type
  const isAmex = cardType === 'amex'
  const targetLength = isAmex ? 15 : 16

  // Pad with random digits if too short
  while (base.length < targetLength - 1) {
    base += Math.floor(Math.random() * 10).toString()
  }

  // Trim if too long (need space for check digit)
  base = base.substring(0, targetLength - 1)

  // Calculate check digit
  const checkDigit = luhnCheckDigit(base)
  const fullNumber = base + checkDigit.toString()

  // Generate expiry — use custom values if provided, otherwise random
  const month = customMonth && customMonth.trim() !== ''
    ? customMonth.padStart(2, '0')
    : String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
  const year = customYear && customYear.trim() !== ''
    ? customYear
    : (new Date().getFullYear() + Math.floor(Math.random() * 5) + 1).toString()

  // Generate CVV
  const cvv = isAmex
    ? String(Math.floor(Math.random() * 9000) + 1000)
    : String(Math.floor(Math.random() * 900) + 100)

  return { number: fullNumber, month, year, cvv, type: cardType }
}

function formatCardNumber(num: string): string {
  return num.replace(/(.{4})/g, '$1 ').trim()
}

function detectCardType(bin: string): string {
  const firstDigit = bin.replace(/[xX]/g, '0')[0]
  if (firstDigit === '4') return 'visa'
  if (firstDigit === '5') return 'mastercard'
  if (firstDigit === '3') return 'amex'
  if (firstDigit === '6') return 'discover'
  return 'random'
}

// ============================================================
// TAB CONFIG
// ============================================================

const tabs: { id: TabId; label: string; icon: typeof CreditCard }[] = [
  { id: 'cards', label: 'Tarjetas', icon: CreditCard },
  { id: 'checker', label: 'Checker', icon: Search },
  { id: 'iptv', label: 'IPTV', icon: Tv },
  { id: 'email', label: 'Correo', icon: Mail },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

// ============================================================
// MAIN APP COMPONENT
// ============================================================

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('cards')

  return (
    <div className="min-h-screen theme-text flex flex-col" style={{ background: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b px-4 py-3" style={{ background: 'var(--app-header)', borderColor: 'var(--app-card-border)' }}>
        <div className="flex items-center justify-center gap-2">
          <img src="/logo.svg" alt="ToolKit" className="w-7 h-7 rounded-lg" />
          <h1 className="text-base font-semibold tracking-tight">
            <span className="text-amber-500">ToolKit</span>
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--app-text-dim)' }}>Pro</span>
          </h1>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto pb-20">
        {(['cards', 'checker', 'iptv', 'email', 'settings'] as TabId[]).map(tabId => (
          <div
            key={tabId}
            className={activeTab === tabId ? 'px-4 py-4' : 'hidden'}
          >
            {tabId === 'cards' && <CardsTab />}
            {tabId === 'checker' && <CheckerTab />}
            {tabId === 'iptv' && <IptvTab />}
            {tabId === 'email' && <EmailTab />}
            {tabId === 'settings' && <SettingsTab />}
          </div>
        ))}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t" style={{ background: 'var(--app-nav)', borderColor: 'var(--app-card-border)' }}>
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-all duration-200 ${
                  isActive ? 'text-amber-500' : 'hover:text-amber-500/60'
                }`}
                style={!isActive ? { color: 'var(--app-text-dim)' } : undefined}
              >
                <div className={`relative ${isActive ? 'scale-110' : ''} transition-transform duration-200`}>
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </div>
                <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-normal'}`}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
        {/* Safe area spacer for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}

// ============================================================
// TAB 1: CREDIT CARD GENERATOR
// ============================================================

function CardsTab() {
  const [bin, setBin] = useState('414718149648xxxx')
  const [quantity, setQuantity] = useState('10')
  const [customMonth, setCustomMonth] = useState('')
  const [customYear, setCustomYear] = useState('')
  const [cards, setCards] = useState<GeneratedCard[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const handleGenerate = useCallback(() => {
    if (!bin.trim()) {
      toast.error('Ingresa un BIN válido')
      return
    }
    const qty = Math.min(Math.max(parseInt(quantity) || 1, 1), 100)
    const type = detectCardType(bin)
    const m = customMonth.trim() || undefined
    const y = customYear.trim() || undefined
    const generated: GeneratedCard[] = []
    for (let i = 0; i < qty; i++) {
      generated.push(generateCardFromBin(bin.trim(), type, m, y))
    }
    setCards(generated)
    toast.success(`${qty} tarjeta${qty > 1 ? 's' : ''} generada${qty > 1 ? 's' : ''}`)
  }, [bin, quantity, customMonth, customYear])

  const copyCard = useCallback(async (card: GeneratedCard, idx: number) => {
    const text = `${card.number}|${card.month}|${card.year}|${card.cvv}`
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopiedIdx(null), 1500)
  }, [])

  const copyAll = useCallback(async () => {
    if (cards.length === 0) return
    const text = cards.map(c => `${c.number}|${c.month}|${c.year}|${c.cvv}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    toast.success(`${cards.length} tarjetas copiadas`)
    setTimeout(() => setCopiedAll(false), 2000)
  }, [cards])

  return (
    <div className="space-y-4">
      {/* BIN Input */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        <label className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">BIN / Plantilla</label>
        <input
          type="text"
          value={bin}
          onChange={(e) => setBin(e.target.value)}
          placeholder="414718149648xxxx"
          className="w-full bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono transition-colors"
        />
        <div className="flex gap-2">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            max="100"
            placeholder="Cantidad"
            className="w-20 bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 font-mono transition-colors"
          />
          <select
            value={customMonth}
            onChange={(e) => setCustomMonth(e.target.value)}
            className="flex-1 bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text focus:outline-none focus:border-amber-500/50 transition-colors"
          >
            <option value="">Mes (Rnd)</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={customYear}
            onChange={(e) => setCustomYear(e.target.value)}
            className="flex-1 bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text focus:outline-none focus:border-amber-500/50 transition-colors"
          >
            <option value="">Año (Rnd)</option>
            {Array.from({ length: 10 }, (_, i) => {
              const y = (new Date().getFullYear() + i).toString()
              return <option key={y} value={y}>{y}</option>
            })}
          </select>
        </div>
        <button
          onClick={handleGenerate}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Generar
        </button>
      </div>

      {/* Results */}
      {cards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 theme-text-dim">{cards.length} resultado{cards.length > 1 ? 's' : ''}</span>
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Copiar Todo
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-2 custom-scrollbar">
            {cards.map((card, idx) => (
              <motion.div
                key={`${card.number}-${idx}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="bg-gradient-to-br from-[#1a1a2e] to-[#111113] theme-gradient-card rounded-xl border border-white/[0.06] p-3.5 group"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-amber-500/70" />
                      <span className="text-xs uppercase tracking-wider text-white/30 theme-text-dim font-medium">
                        {card.type}
                      </span>
                    </div>
                    <p className="font-mono text-sm tracking-wider text-white/90 theme-text">
                      {formatCardNumber(card.number)}
                    </p>
                    <div className="flex gap-4 text-xs font-mono text-white/50 theme-text-dim">
                      <span>{card.month}/{card.year}</span>
                      <span>CVV: {card.cvv}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => copyCard(card, idx)}
                    className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    {copiedIdx === idx ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-white/30 theme-text-dim group-hover:text-white/60 theme-text-dim" />
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TAB 2: CCS CHECKER
// ============================================================

function CheckerTab() {
  const [ccList, setCcList] = useState('')
  const [results, setResults] = useState<CheckResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [stats, setStats] = useState({ total: 0, live: 0, dead: 0 })
  const stopRef = useRef(false)

  const startCheck = useCallback(async () => {
    const lines = ccList.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) {
      toast.error('Pega al menos una CC')
      return
    }

    setIsRunning(true)
    stopRef.current = false
    setResults([])
    setStats({ total: 0, live: 0, dead: 0 })

    let total = 0
    let live = 0
    let dead = 0

    for (const line of lines) {
      if (stopRef.current) break

      const cc = line.trim()
      if (!cc) continue

      setResults(prev => [...prev, { cc, status: 'checking' }])

      try {
        const res = await fetch('/api/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cc }),
        })
        const data = await res.json()

        total++

        const isLive = data.code === 1 || data.status === 'Live' || data.msg?.toLowerCase().includes('live') || data.msg?.toLowerCase().includes('approved')

        if (isLive) {
          live++
          setResults(prev =>
            prev.map((r, i) =>
              i === prev.length - 1
                ? { ...r, status: 'live', message: data.msg || 'Aprobada', brand: data.brand || data.type, bank: data.bank || data.issuer }
                : r
            )
          )
        } else {
          dead++
          setResults(prev =>
            prev.map((r, i) =>
              i === prev.length - 1
                ? { ...r, status: 'dead', message: data.msg || data.message || 'Rechazada' }
                : r
            )
          )
        }

        setStats({ total, live, dead })
      } catch {
        dead++
        total++
        setResults(prev =>
          prev.map((r, i) =>
            i === prev.length - 1 ? { ...r, status: 'error', message: 'Error de conexión' } : r
          )
        )
        setStats({ total, live, dead })
      }

      // Delay between requests
      await new Promise(r => setTimeout(r, 500))
    }

    setIsRunning(false)
    toast.success(`Verificación completada: ${live} vivas, ${dead} muertas`)
  }, [ccList])

  const stopCheck = useCallback(() => {
    stopRef.current = true
    setIsRunning(false)
    toast.info('Verificación detenida')
  }, [])

  const liveResults = results.filter(r => r.status === 'live')
  const dotResults = results.filter(r => r.status === 'dead' || r.status === 'error')

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        <label className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">Lista de CC</label>
        <textarea
          value={ccList}
          onChange={(e) => setCcList(e.target.value)}
          placeholder="4147181496481361|09|2028|010&#10;4147181496481362|10|2027|011"
          rows={4}
          className="w-full bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono resize-none transition-colors"
        />
        <div className="flex gap-2">
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
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              Detener
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-3 text-center">
            <p className="text-lg font-bold text-white theme-text font-mono">{stats.total}</p>
            <p className="text-[10px] text-white/40 theme-text-dim uppercase">Total</p>
          </div>
          <div className="bg-[#111113] theme-card rounded-xl border border-green-500/20 p-3 text-center">
            <p className="text-lg font-bold text-green-500 font-mono">{stats.live}</p>
            <p className="text-[10px] text-green-500/60 uppercase">Aprobadas</p>
          </div>
          <div className="bg-[#111113] theme-card rounded-xl border border-red-500/20 p-3 text-center">
            <p className="text-lg font-bold text-red-500 font-mono">{stats.dead}</p>
            <p className="text-[10px] text-red-500/60 uppercase">Rechazadas</p>
          </div>
        </div>
      )}

      {/* Live Results */}
      {liveResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-green-500/80 uppercase tracking-wider">✓ Aprobadas</h3>
          <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar">
            {liveResults.map((r, i) => (
              <motion.div
                key={`live-${i}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-mono text-green-400">{r.cc}</p>
                  {r.message && <p className="text-[10px] text-green-500/60 mt-0.5">{r.message}</p>}
                  {(r.brand || r.bank) && (
                    <p className="text-[10px] text-white/30 theme-text-dim mt-0.5">
                      {[r.brand, r.bank].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(r.cc); toast.success('Copiado') }}
                  className="p-1 hover:bg-white/[0.06] rounded"
                >
                  <Copy className="w-3.5 h-3.5 text-green-500/60" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Dead dots */}
      {dotResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-red-500/80 uppercase tracking-wider">✗ Rechazadas</h3>
          <div className="flex flex-wrap gap-1.5">
            {dotResults.map((_, i) => (
              <div key={`dead-${i}`} className="w-2 h-2 rounded-full bg-red-500/40" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TAB 3: IPTV CHECKER + PLAYER
// ============================================================

function IptvTab() {
  const [subTab, setSubTab] = useState<'checker' | 'player'>('checker')

  return (
    <div className="space-y-4">
      {/* Sub-tab selector */}
      <div className="flex bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-1">
        <button
          onClick={() => setSubTab('checker')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            subTab === 'checker' ? 'bg-amber-500 text-black' : 'text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
          }`}
        >
          Checker
        </button>
        <button
          onClick={() => setSubTab('player')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            subTab === 'player' ? 'bg-amber-500 text-black' : 'text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
          }`}
        >
          Reproductor
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
        >
          {subTab === 'checker' ? <IptvChecker /> : <IptvPlayer />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function IptvChecker() {
  const [comboList, setComboList] = useState('')
  const [serverHost, setServerHost] = useState('')
  const [threads, setThreads] = useState('5')
  const [inputMode, setInputMode] = useState<'url' | 'combo'>('url')
  const [fileName, setFileName] = useState('')
  const [lineCount, setLineCount] = useState(0)
  const [results, setResults] = useState<IptvResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [stats, setStats] = useState({ total: 0, hits: 0, bad: 0, timeout: 0 })
  const stopRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clear results/stats/input when switching modes
  useEffect(() => {
    setResults([])
    setStats({ total: 0, hits: 0, bad: 0, timeout: 0 })
    setComboList('')
    setFileName('')
    setLineCount(0)
    stopRef.current = false
    setIsRunning(false)
    sessionIdRef.current = null
  }, [inputMode])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // Resume session from sessionStorage on mount (survives tab switch/reload)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('iptv_check_session')
      if (saved) {
        const { sessionId } = JSON.parse(saved)
        if (sessionId) {
          sessionIdRef.current = sessionId
          setIsRunning(true)

          // Start polling again
          const pollResults = async () => {
            if (!sessionIdRef.current) return
            try {
              const res = await fetch(`/api/iptv/check?sessionId=${encodeURIComponent(sessionIdRef.current)}`)
              const data = await res.json()

              if (data.error || !data.isRunning) {
                // Session ended or not found
                if (pollTimerRef.current) clearInterval(pollTimerRef.current)
                setIsRunning(false)
                sessionIdRef.current = null
                try { sessionStorage.removeItem('iptv_check_session') } catch {}
                if (data.results) {
                  setResults(data.results)
                  setStats(data.stats || { total: 0, hits: 0, bad: 0, timeout: 0 })
                  if (data.isComplete) toast.success(`Verificación completada: ${data.stats?.hits || 0} hits`)
                }
                return
              }

              setResults(data.results || [])
              setStats(data.stats || { total: 0, hits: 0, bad: 0, timeout: 0 })

              if (data.isComplete || !data.isRunning) {
                if (pollTimerRef.current) clearInterval(pollTimerRef.current)
                setIsRunning(false)
                sessionIdRef.current = null
                try { sessionStorage.removeItem('iptv_check_session') } catch {}
                toast.success(`Verificación completada: ${data.stats?.hits || 0} hits`)
              }
            } catch {
              // Network error — keep polling
            }
          }

          pollResults()
          pollTimerRef.current = setInterval(pollResults, 1500)
        }
      }
    } catch {}
  }, [])

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
    // Reset input so same file can be uploaded again
    e.target.value = ''
  }, [])

  const startCheck = useCallback(async () => {
    const lines = comboList.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) {
      toast.error('Carga un combo o pega líneas')
      return
    }
    if (inputMode === 'combo' && !serverHost.trim()) {
      toast.error('Ingresa el servidor (host:port)')
      return
    }

    setIsRunning(true)
    stopRef.current = false
    setResults([])
    setStats({ total: 0, hits: 0, bad: 0, timeout: 0 })

    try {
      // Start server-side check session — runs in background even if user leaves
      const startRes = await fetch('/api/iptv/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines,
          inputMode,
          serverHost: serverHost.trim(),
          threads: parseInt(threads) || 5,
        }),
      })
      const startData = await startRes.json()

      if (startData.error) {
        toast.error(startData.error)
        setIsRunning(false)
        return
      }

      const sessionId = startData.sessionId
      sessionIdRef.current = sessionId

      // Save session to sessionStorage so we can resume after tab switch/reload
      try {
        sessionStorage.setItem('iptv_check_session', JSON.stringify({
          sessionId,
          inputMode,
          serverHost: serverHost.trim(),
          startedAt: Date.now(),
        }))
      } catch {}

      // Poll for results every 1.5 seconds
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      
      const pollResults = async () => {
        if (!sessionIdRef.current) return
        try {
          const res = await fetch(`/api/iptv/check?sessionId=${encodeURIComponent(sessionIdRef.current)}`)
          const data = await res.json()

          if (data.error) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            setIsRunning(false)
            sessionIdRef.current = null
            try { sessionStorage.removeItem('iptv_check_session') } catch {}
            return
          }

          // Update results — replace all with server state
          setResults(data.results || [])
          setStats(data.stats || { total: 0, hits: 0, bad: 0, timeout: 0 })

          if (data.isComplete || !data.isRunning) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            setIsRunning(false)
            sessionIdRef.current = null
            try { sessionStorage.removeItem('iptv_check_session') } catch {}
            toast.success(`Verificación completada: ${data.stats?.hits || 0} hits`)
          }
        } catch {
          // Network error — keep polling, server is still running
        }
      }

      // Initial poll
      pollResults()
      // Then poll every 1.5s
      pollTimerRef.current = setInterval(pollResults, 1500)

    } catch {
      toast.error('Error al iniciar verificación')
      setIsRunning(false)
    }
  }, [comboList, threads, inputMode, serverHost])

  const stopCheck = useCallback(async () => {
    stopRef.current = true
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (sessionIdRef.current) {
      try {
        await fetch(`/api/iptv/check?sessionId=${encodeURIComponent(sessionIdRef.current)}`, { method: 'DELETE' })
      } catch {}
      sessionIdRef.current = null
    }
    try { sessionStorage.removeItem('iptv_check_session') } catch {}
    setIsRunning(false)
    toast.info('Verificación detenida')
  }, [])

  const hitResults = results.filter(r => r.status === 'hit')

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        {/* Mode selector */}
        <div className="flex bg-[#09090b] theme-input rounded-lg border border-white/[0.06] p-0.5">
          <button
            onClick={() => setInputMode('url')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              inputMode === 'url' ? 'bg-amber-500 text-black' : 'text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
            }`}
          >
            URL Mode
          </button>
          <button
            onClick={() => setInputMode('combo')}
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
            placeholder="Servidor (host:port) ej: canal-pro.xyz:8080"
            className="w-full bg-[#09090b] theme-input border border-amber-500/30 rounded-lg px-3 py-2.5 text-sm text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 font-mono transition-colors"
          />
        )}

        {/* Textarea — only in URL mode */}
        {inputMode === 'url' && (
          <textarea
            value={comboList}
            onChange={(e) => setComboList(e.target.value)}
            placeholder="http://host:port/get.php?username=USER&password=PASS"
            rows={4}
            className="w-full bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono resize-none transition-colors"
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
              className="w-full border-2 border-dashed border-white/[0.08] hover:border-amber-500/40 rounded-lg py-4 flex flex-col items-center justify-center gap-1.5 transition-colors group"
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
            className="w-20 bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white theme-text focus:outline-none focus:border-amber-500/50 font-mono transition-colors"
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
              <p className={`text-base font-bold font-mono ${s.color}`}>{s.value}</p>
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
                  {/* Glow accent */}
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />
                  
                  <div className="p-3.5" style={{ background: 'linear-gradient(to bottom right, rgba(34,197,94,0.07), rgba(16,185,129,0.03))' }}>
                    {/* Header with crown */}
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

                    {/* Info rows — tree format */}
                    <div className="space-y-0 font-mono text-[11px] leading-relaxed">
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-amber-400/80 ml-1 shrink-0">👤</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">User:</span>
                        <span className="text-white/90 theme-text ml-1 truncate">{r.username}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-amber-400/80 ml-1 shrink-0">🔑</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">Pass:</span>
                        <span className="text-white/90 theme-text ml-1 truncate">{r.password}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-green-400 ml-1 shrink-0">✅</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">Status:</span>
                        <span className="text-green-400 font-semibold ml-1">{info?.status || 'Active'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-blue-400/80 ml-1 shrink-0">📶</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">Active:</span>
                        <span className="text-white/80 theme-text ml-1">{info?.active_cons || '0'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-purple-400/80 ml-1 shrink-0">📡</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">Max:</span>
                        <span className="text-white/80 theme-text ml-1">{info?.max_connections || '0'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-cyan-400/80 ml-1 shrink-0">⏰</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">Creado:</span>
                        <span className="text-white/70 theme-text-dim ml-1">{info?.created_at || 'N/A'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-orange-400/80 ml-1 shrink-0">📅</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">Exp:</span>
                        <span className="text-white/70 theme-text-dim ml-1">{info?.exp_date || 'N/A'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">├</span>
                        <span className="text-yellow-400/80 ml-1 shrink-0">🕰️</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">TZ:</span>
                        <span className="text-white/60 theme-text-dim ml-1">{info?.timezone || 'N/A'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-white/20 theme-text-faint shrink-0">└</span>
                        <span className="text-sky-400/80 ml-1 shrink-0">🔗</span>
                        <span className="text-white/40 theme-text-dim ml-1 shrink-0 w-14">M3U:</span>
                        <span className="text-sky-400/60 ml-1 break-all text-[10px]">{m3uUrl}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function IptvPlayer() {
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [channels, setChannels] = useState<Array<{ name: string; url: string; logo: string; group: string; tvgId: string }>>([])
  const [groups, setGroups] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentChannel, setCurrentChannel] = useState<{ name: string; url: string; logo: string } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playerError, setPlayerError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<unknown>(null)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 5

  // Destroy HLS instance on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        (hlsRef.current as { destroy: () => void }).destroy()
        hlsRef.current = null
      }
    }
  }, [])

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

    // Stop any playing stream
    if (hlsRef.current) {
      (hlsRef.current as { destroy: () => void }).destroy()
      hlsRef.current = null
    }

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

      const allChannels = data.channels || []
      const allGroups = data.groups || []
      setGroups(allGroups)
      setSelectedGroup('all')

      // Progressive load: show first 200 channels immediately, then load the rest
      // This makes the UI feel instant even with 10,000+ channel lists
      const BATCH_SIZE = 200
      if (allChannels.length <= BATCH_SIZE) {
        setChannels(allChannels)
      } else {
        setChannels(allChannels.slice(0, BATCH_SIZE))
        // Load remaining channels in batches
        let offset = BATCH_SIZE
        const loadBatch = () => {
          const nextBatch = allChannels.slice(offset, offset + BATCH_SIZE)
          if (nextBatch.length === 0) return
          offset += BATCH_SIZE
          setChannels(prev => [...prev, ...nextBatch])
          requestAnimationFrame(loadBatch)
        }
        requestAnimationFrame(loadBatch)
      }

      toast.success(`${data.total} canales cargados`)
    } catch {
      toast.error('Error al cargar la lista')
    } finally {
      setIsLoading(false)
    }
  }, [playlistUrl])

  const playChannel = useCallback((channel: { name: string; url: string; logo: string }) => {
    const video = videoRef.current
    if (!video) return

    // Destroy previous HLS instance
    if (hlsRef.current) {
      (hlsRef.current as { destroy: () => void }).destroy()
      hlsRef.current = null
    }

    setCurrentChannel(channel)
    setIsPlaying(false)
    setPlayerError('')
    retryCountRef.current = 0

    const streamUrl = channel.url
    const proxyUrl = `/api/iptv/stream?url=${encodeURIComponent(streamUrl)}`

    // Detect if the URL is likely an HLS manifest or a direct stream
    const isLikelyHLS = streamUrl.includes('.m3u8') ||
      streamUrl.includes('/live/') ||
      streamUrl.includes('type=m3u_plus') ||
      streamUrl.includes('get.php') ||
      streamUrl.includes('/stream/') ||
      streamUrl.includes('format=m3u8')

    // Heuristic for direct video streams (TS, MP4, etc.)
    const isLikelyDirectStream = streamUrl.includes('.ts') ||
      streamUrl.includes('.mp4') ||
      streamUrl.includes('.mkv') ||
      streamUrl.includes('.avi') ||
      streamUrl.includes('.flv') ||
      streamUrl.includes('.mov')

    const tryHLSPlayback = () => {
      if (typeof window === 'undefined') return

      import('hls.js').then(({ default: Hls }) => {
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
          })
          hlsRef.current = hls

          hls.loadSource(proxyUrl)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {})
            setIsPlaying(true)
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (retryCountRef.current < MAX_RETRIES) {
                    retryCountRef.current++
                    hls.startLoad()
                  } else {
                    // HLS failed after retries — try direct playback as fallback
                    hls.destroy()
                    hlsRef.current = null
                    tryDirectPlayback()
                  }
                  break
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError()
                  break
                default:
                  // HLS failed — try direct playback as fallback
                  hls.destroy()
                  hlsRef.current = null
                  tryDirectPlayback()
                  break
              }
            }
          })
        } else {
          // hls.js not supported — try native or direct
          tryNativeOrDirectPlayback()
        }
      })
    }

    const tryDirectPlayback = () => {
      video.src = proxyUrl
      video.play().then(() => setIsPlaying(true)).catch(() => {
        setPlayerError('No se puede reproducir este canal — formato no soportado')
      })
    }

    const tryNativeOrDirectPlayback = () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = proxyUrl
        video.play().then(() => setIsPlaying(true)).catch(() => tryDirectPlayback())
      } else {
        tryDirectPlayback()
      }
    }

    // Strategy: If the URL looks like a direct stream (TS, MP4), skip HLS and play directly.
    // Otherwise, try HLS first and fall back to direct if it fails.
    if (isLikelyDirectStream && !isLikelyHLS) {
      tryDirectPlayback()
    } else {
      tryHLSPlayback()
    }
  }, [])

  const stopStream = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    if (hlsRef.current) {
      (hlsRef.current as { destroy: () => void }).destroy()
      hlsRef.current = null
    }
    setIsPlaying(false)
    setCurrentChannel(null)
    setPlayerError('')
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const handleVolume = useCallback((v: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = v
    setVolume(v)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current
    if (!container) return
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  // Filter channels — memoized for performance with 50k+ channels
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchGroup = selectedGroup === 'all' || ch.group === selectedGroup
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchGroup && matchSearch
    })
  }, [channels, selectedGroup, searchQuery])

  const channelCountByGroup = useCallback((group: string) => {
    return channels.filter(c => c.group === group).length
  }, [channels])

  // Virtual scrolling for large channel lists
  const ITEM_HEIGHT = 48 // approximate height of each channel row
  const VISIBLE_ITEMS = 80 // render buffer
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const handleChannelScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop)
    }
  }, [])

  const totalHeight = filteredChannels.length * ITEM_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - Math.floor(VISIBLE_ITEMS / 2))
  const endIndex = Math.min(filteredChannels.length, startIndex + VISIBLE_ITEMS)
  const visibleChannels = filteredChannels.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      {/* Playlist URL Input */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        <label className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">Lista M3U / M3U Plus</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="http://server:port/get.php?username=USER&password=PASS&type=m3u_plus"
            className="flex-1 bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono transition-colors"
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
      </div>

      {/* Video Player */}
      <div ref={playerContainerRef} className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            className="w-full h-full"
            playsInline
          />
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
              <div className="text-center">
                <Info className="w-8 h-8 text-red-400/60 mx-auto mb-2" />
                <p className="text-xs text-red-400/80">{playerError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls bar */}
        {currentChannel && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06]">
            <span className="text-xs text-white/40 theme-text-dim truncate flex-1 font-medium">{currentChannel.name}</span>
            <button onClick={toggleMute} className="text-white/70 theme-text-dim hover:text-white theme-text transition-colors">
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
            <button onClick={toggleFullscreen} className="text-white/70 theme-text-dim hover:text-white theme-text transition-colors">
              <Globe className="w-4 h-4" />
            </button>
            <button onClick={stopStream} className="text-red-400 hover:text-red-300 transition-colors">
              <Square className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Channel List */}
      {channels.length > 0 && (
        <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] overflow-hidden">
          {/* Header with search and group filter */}
          <div className="p-3 border-b border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">
                {filteredChannels.length} / {channels.length} canales
              </span>
            </div>
            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal..."
              className="w-full bg-[#09090b] theme-input border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white theme-text placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            {/* Group pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              <button
                onClick={() => setSelectedGroup('all')}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  selectedGroup === 'all' ? 'bg-amber-500 text-black' : 'bg-white/[0.06] text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
                }`}
              >
                Todos ({channels.length})
              </button>
              {groups.slice(0, 20).map(g => (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(g)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                    selectedGroup === g ? 'bg-amber-500 text-black' : 'bg-white/[0.06] text-white/50 theme-text-dim hover:text-white/70 theme-text-dim'
                  }`}
                >
                  {g} ({channelCountByGroup(g)})
                </button>
              ))}
              {groups.length > 20 && (
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="shrink-0 bg-white/[0.06] text-white/50 theme-text-dim text-[10px] rounded-full px-2 py-1 border-0 focus:outline-none"
                >
                  <option value="all">Más...</option>
                  {groups.map(g => (
                    <option key={g} value={g}>{g} ({channelCountByGroup(g)})</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Channel grid — virtual scrolling for 50k+ channels */}
          <div
            ref={scrollRef}
            onScroll={handleChannelScroll}
            className="max-h-[50vh] overflow-y-auto custom-scrollbar"
          >
            {filteredChannels.length === 0 ? (
              <div className="p-6 text-center text-white/30 theme-text-dim text-xs">No se encontraron canales</div>
            ) : (
              <div style={{ height: totalHeight, position: 'relative' }}>
                <div style={{ position: 'absolute', top: startIndex * ITEM_HEIGHT, left: 0, right: 0 }}>
                  <div className="grid grid-cols-1 divide-y divide-white/[0.04]">
                    {visibleChannels.map((ch, vi) => {
                      const idx = startIndex + vi
                      return (
                        <button
                          key={`ch-${idx}-${ch.name}`}
                          onClick={() => playChannel(ch)}
                          style={{ height: ITEM_HEIGHT }}
                          className={`w-full flex items-center gap-3 px-4 text-left transition-colors ${
                            currentChannel?.url === ch.url
                              ? 'bg-amber-500/10 border-l-2 border-amber-500'
                              : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                          }`}
                        >
                          {/* Logo or placeholder */}
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
                              <Tv className="w-4 h-4 text-white/20 theme-text-faint" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium truncate ${
                              currentChannel?.url === ch.url ? 'text-amber-400' : 'text-white/80 theme-text'
                            }`}>
                              {ch.name}
                            </p>
                            <p className="text-[10px] text-white/30 theme-text-dim truncate">{ch.group}</p>
                          </div>
                          {currentChannel?.url === ch.url && isPlaying && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <span className="w-0.5 h-2 bg-amber-500 rounded-full animate-pulse" />
                              <span className="w-0.5 h-3 bg-amber-500 rounded-full animate-pulse [animation-delay:0.15s]" />
                              <span className="w-0.5 h-1.5 bg-amber-500 rounded-full animate-pulse [animation-delay:0.3s]" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TAB 4: TEMPORARY EMAIL
// ============================================================

function EmailTab() {
  const [account, setAccount] = useState<EmailAccount | null>(null)
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [selectedMsg, setSelectedMsg] = useState<{ id: string; from: string; subject: string; body: string } | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingMsg, setIsLoadingMsg] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sanitize HTML to prevent XSS attacks from email content
  const sanitizeHtml = useCallback((html: string): string => {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^>]*>/gi, '')
      .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/<meta\b[^>]*>/gi, '')
      .replace(/<link\b[^>]*>/gi, '')
      .replace(/<base\b[^>]*>/gi, '')
  }, [])

  const createEmail = useCallback(async () => {
    setIsCreating(true)
    setTokenExpired(false)
    try {
      const res = await fetch('/api/email/create', { method: 'POST' })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      setAccount({ address: data.address, token: data.token, id: data.id, provider: data.provider || 'mail.tm' })
      setMessages([])
      setSelectedMsg(null)
      toast.success('Correo temporal creado')
      // Note: auto-refresh interval is handled by the useEffect below
    } catch {
      toast.error('Error al crear correo')
    } finally {
      setIsCreating(false)
    }
  }, [])

  const fetchMessages = useCallback(async (token?: string) => {
    const t = token || account?.token
    const p = account?.provider || 'mail.tm'
    if (!t) return

    try {
      const res = await fetch(`/api/email/messages?provider=${encodeURIComponent(p)}`, {
        headers: { Authorization: `Bearer ${t}`, 'X-Mail-Provider': p },
      })

      if (res.status === 401) {
        setTokenExpired(true)
        toast.error('Token expirado — genera un nuevo correo')
        return
      }

      const data = await res.json()

      if (data.error) return

      const msgs = data['hydra:member'] || data
      setMessages(Array.isArray(msgs) ? msgs : [])
    } catch {
      // Silent fail for auto-refresh
    }
  }, [account])

  const openMessage = useCallback(async (msg: EmailMessage) => {
    if (!account?.token) return
    setIsLoadingMsg(true)

    try {
      const res = await fetch(`/api/email/messages/${msg.id}?provider=${encodeURIComponent(account.provider)}`, {
        headers: { Authorization: `Bearer ${account.token}`, 'X-Mail-Provider': account.provider },
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      // mail.tm returns html as array or string; handle both
      const htmlContent = Array.isArray(data.html)
        ? data.html.join('')
        : (typeof data.html === 'string' ? data.html : '')

      const body = htmlContent || data.text || msg.intro || 'Sin contenido'

      setSelectedMsg({
        id: data.id,
        from: data.from?.address || msg.from.address,
        subject: data.subject || msg.subject,
        body: sanitizeHtml(body),
      })
    } catch {
      toast.error('Error al cargar mensaje')
    } finally {
      setIsLoadingMsg(false)
    }
  }, [account, sanitizeHtml])

  const deleteAccount = useCallback(async () => {
    if (!account) return

    try {
      await fetch('/api/email/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, token: account.token, provider: account.provider }),
      })

      setAccount(null)
      setMessages([])
      setSelectedMsg(null)
      setTokenExpired(false)
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
      toast.success('Cuenta eliminada')
    } catch {
      toast.error('Error al eliminar cuenta')
    }
  }, [account])

  const copyEmail = useCallback(async () => {
    if (!account) return
    await navigator.clipboard.writeText(account.address)
    setCopiedEmail(true)
    toast.success('Correo copiado')
    setTimeout(() => setCopiedEmail(false), 1500)
  }, [account])

  // Auto-refresh on mount and when account changes
  // Single source of truth for the interval — no duplicate setup
  useEffect(() => {
    if (account && !tokenExpired) {
      fetchMessages()
      // Clear any existing interval before creating a new one
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = setInterval(() => fetchMessages(), 5000)
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [account, tokenExpired, fetchMessages])

  // Message detail view
  if (selectedMsg) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedMsg(null)}
            className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <ChevronDown className="w-4 h-4 text-white/50 theme-text-dim rotate-90" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{selectedMsg.subject}</p>
            <p className="text-xs text-white/40 theme-text-dim truncate">{selectedMsg.from}</p>
          </div>
        </div>

        <div
          className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: selectedMsg.body }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Email Address */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        {account ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">Tu Correo Temporal</span>
              <button
                onClick={deleteAccount}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-[#09090b] theme-input rounded-lg px-3 py-2.5 border border-white/[0.08]">
              <Mail className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm font-mono text-white/90 theme-text flex-1 truncate">{account.address}</p>
              <button onClick={copyEmail} className="shrink-0 p-1 rounded hover:bg-white/[0.06]">
                {copiedEmail ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-white/40 theme-text-dim" />}
              </button>
            </div>
            <button
              onClick={() => fetchMessages()}
              className="flex items-center gap-1.5 text-xs text-amber-500/70 hover:text-amber-500 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Actualizar bandeja
            </button>
            {tokenExpired && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">
                <Info className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-xs text-red-400">Token expirado — genera un nuevo correo</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-center py-4">
              <Mail className="w-10 h-10 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/40 theme-text-dim mb-4">Genera un correo temporal para recibir mensajes</p>
              <button
                onClick={createEmail}
                disabled={isCreating}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isCreating ? 'Creando...' : 'Generar Correo'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Inbox */}
      {account && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">
            Bandeja de Entrada ({messages.length})
          </h3>

          {messages.length === 0 ? (
            <div className="text-center py-8 bg-[#111113] theme-card rounded-xl border border-white/[0.06]">
              <p className="text-sm text-white/30 theme-text-dim">Sin mensajes aún</p>
              <p className="text-xs text-white/20 theme-text-faint mt-1">Los mensajes aparecerán aquí automáticamente</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-1.5 custom-scrollbar">
              {messages.map((msg) => (
                <motion.button
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => openMessage(msg)}
                  className="w-full text-left bg-[#111113] theme-card rounded-lg border border-white/[0.06] p-3 hover:border-white/[0.12] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white/80 theme-text truncate">
                        {msg.from?.name || msg.from?.address || 'Desconocido'}
                      </p>
                      <p className="text-sm text-white/60 theme-text-dim truncate">{msg.subject || 'Sin asunto'}</p>
                      {msg.intro && <p className="text-xs text-white/30 theme-text-dim truncate mt-0.5">{msg.intro}</p>}
                    </div>
                    <span className="text-[10px] text-white/20 theme-text-faint shrink-0">
                      {new Date(msg.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoadingMsg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      )}
    </div>
  )
}

// ============================================================
// TAB 5: SETTINGS
// ============================================================

function SettingsTab() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return true
  })

  const toggleTheme = useCallback(() => {
    const html = document.documentElement
    if (html.classList.contains('dark')) {
      html.classList.remove('dark')
      html.classList.add('light')
      setIsDark(false)
      localStorage.setItem('theme', 'light')
    } else {
      html.classList.remove('light')
      html.classList.add('dark')
      setIsDark(true)
      localStorage.setItem('theme', 'dark')
    }
  }, [])

  // Load saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light') {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      setIsDark(false)
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
      setIsDark(true)
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* App Info */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 overflow-hidden">
          <img src="/logo.svg" alt="ToolKit" className="w-12 h-12" />
        </div>
        <h2 className="text-lg font-bold">
          <span className="text-amber-500">ToolKit</span> Pro
        </h2>
        <p className="text-xs text-white/40 theme-text-dim mt-1">v2.1.0</p>
        <p className="text-xs text-white/30 theme-text-dim mt-3 max-w-xs mx-auto">
          Suite de herramientas multifunción para verificación y análisis
        </p>
      </div>

      {/* Theme Toggle */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isDark ? <Moon className="w-5 h-5 text-amber-500" /> : <Sun className="w-5 h-5 text-amber-500" />}
            <div>
              <p className="text-sm font-medium">Tema {isDark ? 'Oscuro' : 'Claro'}</p>
              <p className="text-xs text-white/40 theme-text-dim">Toca para cambiar a modo {isDark ? 'claro' : 'oscuro'}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              isDark ? 'bg-amber-500' : 'bg-gray-300'
            }`}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
              style={{ transform: isDark ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-3">
        <h3 className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">Módulos</h3>
        {[
          { icon: CreditCard, label: 'Generador de Tarjetas', desc: 'Algoritmo Luhn, BIN personalizable' },
          { icon: Search, label: 'CCS Checker', desc: 'Verificación en tiempo real' },
          { icon: Tv, label: 'IPTV Checker + Player', desc: 'Verificación y reproducción IPTV' },
          { icon: Mail, label: 'Correo Temporal', desc: 'Email instantáneo con mail.tm/mail.gw' },
        ].map((feature, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <feature.icon className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{feature.label}</p>
              <p className="text-xs text-white/40 theme-text-dim">{feature.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* About */}
      <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-white/30 theme-text-dim" />
          <h3 className="text-xs font-medium text-white/50 theme-text-dim uppercase tracking-wider">Acerca de</h3>
        </div>
        <p className="text-xs text-white/40 theme-text-dim leading-relaxed">
          ToolKit Pro es una suite de herramientas de verificación y análisis. 
          Todas las operaciones se realizan de forma segura y los datos no se almacenan en servidores.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Globe className="w-3 h-3 text-white/20 theme-text-faint" />
          <span className="text-xs text-white/20 theme-text-faint">Hecho con Next.js 16 + TypeScript</span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
        <p className="text-xs text-red-400/60 leading-relaxed">
          ⚠️ Esta herramienta es solo con fines educativos y de testing. 
          El uso indebido es responsabilidad del usuario.
        </p>
      </div>
    </div>
  )
}
