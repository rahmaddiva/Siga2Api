import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
    // Satu instance React saja: kalau Radix memuat salinan kedua, hook-nya
    // membaca dispatcher null ("Cannot read properties of null (reading 'useMemo')").
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
})
