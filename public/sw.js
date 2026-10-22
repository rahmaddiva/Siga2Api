/*
 * Service worker Siga2Api.
 *
 * Strategi dipilih menurut sifat berkas:
 *   - navigasi  : network-first + fallback app shell (agar versi terbaru cepat
 *                 terpakai, tapi tetap terbuka saat offline)
 *   - /data/*   : stale-while-revalidate (snapshot 7,9 MB; menyajikan cache
 *                 lebih dulu lalu memperbarui di latar)
 *   - aset statis: cache-first (hash di nama berkas, jadi aman di-cache lama)
 *
 * Snapshot TIDAK di-precache saat install: 1851 berkas akan menggantung
 * instalasi di jaringan lambat. Berkas data masuk cache saat benar-benar dibuka.
 */

const VERSION = 'v1'
const SHELL_CACHE = `siga2api-shell-${VERSION}`
const DATA_CACHE = `siga2api-data-${VERSION}`
const ASSET_CACHE = `siga2api-assets-${VERSION}`
const KEEP = new Set([SHELL_CACHE, DATA_CACHE, ASSET_CACHE])

const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Satu berkas gagal tidak boleh menggagalkan seluruh instalasi.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Hanya respons 200 same-origin yang layak disimpan. */
function cacheable(response) {
  return response && response.status === 200 && response.type === 'basic'
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const fresh = await fetch(request)
    if (cacheable(fresh)) cache.put(request, fresh.clone())
    return fresh
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    // Rute hash ditangani index.html, jadi fallback-nya juga index.html.
    const shell = await cache.match('./index.html')
    if (shell) return shell
    throw new Error('offline dan app shell belum tersimpan')
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (cacheable(response)) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  return cached ?? (await network) ?? Response.error()
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (cacheable(response)) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.pathname.includes('/data/')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/icons/') ||
    url.pathname.endsWith('manifest.webmanifest')
  ) {
    event.respondWith(cacheFirst(request))
  }
})
