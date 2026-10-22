import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'

type Mode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'siga2api-theme'

/**
 * Mode terang/gelap/ikut-sistem.
 *
 * Pilihan disimpan di localStorage dan diterapkan sebagai class `dark` di
 * `<html>` (bukan media query saja) karena token warna di `index.css` memakai
 * `@custom-variant dark (&:is(.dark *))`. Script kecil di `index.html` sudah
 * menerapkan class sebelum React hidup, jadi tidak ada kedipan putih.
 */
function applyMode(mode: Mode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = mode === 'dark' || (mode === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

function readMode(): Mode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

const OPTIONS: { mode: Mode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Terang', icon: Sun },
  { mode: 'dark', label: 'Gelap', icon: Moon },
  { mode: 'system', label: 'Ikuti sistem', icon: Monitor },
]

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => readMode())

  useEffect(() => {
    applyMode(mode)
  }, [mode])

  // Mode "sistem" harus ikut berubah saat OS berganti tema.
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyMode('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const select = (next: Mode) => {
    localStorage.setItem(STORAGE_KEY, next)
    setMode(next)
  }

  return (
    <div
      role="group"
      aria-label="Tema tampilan"
      className="flex items-center rounded-md border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ mode: m, label, icon: Icon }) => (
        <button
          key={m}
          type="button"
          onClick={() => select(m)}
          aria-pressed={mode === m}
          aria-label={label}
          title={label}
          className={cn(
            'grid size-7 cursor-pointer place-items-center rounded transition-colors',
            mode === m
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
