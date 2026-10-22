import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker hanya di build produksi: saat `vite dev` berkas di `public/`
// tidak melewati pipeline Vite, dan cache SW akan menyajikan bundel basi.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => {
      // Kegagalan registrasi (mis. bukan HTTPS) tidak boleh memecah aplikasi.
      console.warn('Service worker gagal didaftarkan:', e)
    })
  })
}
