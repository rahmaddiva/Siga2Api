import {
  Activity,
  Baby,
  ClipboardList,
  FileSpreadsheet,
  HeartPulse,
  Table2,
  type LucideIcon,
} from 'lucide-react'

/** Ikon per modul snapshot; modul tak dikenal memakai ikon tabel generik. */
export const MODULE_ICON: Record<string, LucideIcon> = {
  yankb: ClipboardList,
  dallap: FileSpreadsheet,
  krs: HeartPulse,
  elsimil: Baby,
}

/** Ikon cadangan untuk modul yang belum punya ikon khusus. */
export const FALLBACK_MODULE_ICON = Table2

/**
 * Modul yang datanya diambil live, bukan dari snapshot `public/data/`.
 * Tidak masuk `index.modules` karena tidak punya katalog laporan.
 */
export const LIVE_MODULE = { id: 'verval', label: 'Verval KRS', icon: Activity }
