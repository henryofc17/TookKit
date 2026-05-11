'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, Search, Tv, Mail, Settings, Copy, Check, Play, Pause,
  Volume2, VolumeX, Trash2, RefreshCw, ChevronDown, Info, Moon, Sun,
  X, Loader2, Square, Send, ExternalLink, Zap, Globe, Upload, AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import { List } from 'react-window'
import { IptvChecker } from '@/components/iptv/iptv-checker'
import { IptvPlayer } from '@/components/iptv/iptv-player'

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
// UTILITY: Debounce hook
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
  let base = ''
  for (const ch of bin) {
    if (ch === 'x' || ch === 'X') {
      base += Math.floor(Math.random() * 10).toString()
    } else if (/\d/.test(ch)) {
      base += ch
    }
  }

  const isAmex = cardType === 'amex'
  const targetLength = isAmex ? 15 : 16

  while (base.length < targetLength - 1) {
    base += Math.floor(Math.random() * 10).toString()
  }

  base = base.substring(0, targetLength - 1)

  const checkDigit = luhnCheckDigit(base)
  const fullNumber = base + checkDigit.toString()

  const month = customMonth && customMonth.trim() !== ''
    ? customMonth.padStart(2, '0')
    : String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
  const year = customYear && customYear.trim() !== ''
    ? customYear
    : (new Date().getFullYear() + Math.floor(Math.random() * 5) + 1).toString()

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

// IptvChecker moved to @/components/iptv/iptv-checker.tsx
// IptvPlayer moved to @/components/iptv/iptv-player.tsx

// ============================================================
// TAB 4: TEMPORARY EMAIL — With persistence
// ============================================================

function EmailTab() {
  const [account, setAccount] = useState<EmailAccount | null>(null)
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [selectedMsg, setSelectedMsg] = useState<{ id: string; from: string; subject: string; body: string } | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingMsg, setIsLoadingMsg] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [isRecovering, setIsRecovering] = useState(true)
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

  // Try to recover email from server DB or localStorage on mount
  useEffect(() => {
    const recoverEmail = async () => {
      // First try localStorage (fast, works offline)
      try {
        const saved = localStorage.getItem('toolkit_email')
        if (saved) {
          const parsed = JSON.parse(saved) as EmailAccount
          if (parsed.address && parsed.token && parsed.id) {
            setAccount(parsed)
            setIsRecovering(false)
            return
          }
        }
      } catch {}

      // Then try server recovery
      try {
        const res = await fetch('/api/email/recover')
        const data = await res.json()
        if (data.address && data.token && data.id) {
          const recovered: EmailAccount = {
            address: data.address,
            token: data.token,
            id: data.id,
            provider: data.provider || 'mail.tm',
          }
          setAccount(recovered)
          // Also save to localStorage for faster recovery next time
          try {
            localStorage.setItem('toolkit_email', JSON.stringify(recovered))
          } catch {}
        }
      } catch {
        // Recovery failed — user will need to create a new email
      }

      setIsRecovering(false)
    }

    recoverEmail()
  }, [])

  // Save account to localStorage whenever it changes
  useEffect(() => {
    if (account) {
      try {
        localStorage.setItem('toolkit_email', JSON.stringify(account))
      } catch {}
    } else {
      try {
        localStorage.removeItem('toolkit_email')
      } catch {}
    }
  }, [account])

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

      const newAccount = { address: data.address, token: data.token, id: data.id, provider: data.provider || 'mail.tm' }
      setAccount(newAccount)
      setMessages([])
      setSelectedMsg(null)
      toast.success('Correo temporal creado')
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
  useEffect(() => {
    if (account && !tokenExpired) {
      fetchMessages()
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

  // Show loading state while recovering
  if (isRecovering) {
    return (
      <div className="space-y-4">
        <div className="bg-[#111113] theme-card rounded-xl border border-white/[0.06] p-8 text-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
          <p className="text-xs text-white/40 theme-text-dim mt-3">Recuperando correo...</p>
        </div>
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
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
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
        <p className="text-xs text-white/40 theme-text-dim mt-1">v3.0.0</p>
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
          { icon: Tv, label: 'IPTV Checker + Player', desc: 'Verificación y reproducción directa' },
          { icon: Mail, label: 'Correo Temporal', desc: 'Email persistente con mail.tm/mail.gw' },
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
          ToolKit Pro v3.0 — Refactored for Vercel serverless. Direct IPTV streaming, 
          client-driven batch processing, email persistence, virtual scrolling for 200K+ channels.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Globe className="w-3 h-3 text-white/20 theme-text-faint" />
          <span className="text-xs text-white/20 theme-text-faint">Hecho con Next.js 16 + TypeScript</span>
        </div>
      </div>
    </div>
  )
}
