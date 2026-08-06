// 红楼梦大观园 Service Worker —— 决策 42（PWA 离线化）
// 策略：导航请求 NetworkFirst（离线回退缓存 HTML）；带 hash 的构建资源 CacheFirst；
// 无 hash 的 public 大资源（models/images/videos）NetworkFirst，避免重部署后陈旧（审查修复 P0-2）。
// 2026-08-03：PRECACHE/回退路径改为基于脚本位置的相对 URL，修复子路径部署下注册/缓存失效。
const CACHE = 'hlm-cache-v2'
// sw.js 位于 <subpath>/sw.js，相对 './' 即站点子路径根
const ROOT = new URL('./', self.location.href)

function sub(path) {
  return new URL(path, ROOT).href
}

const PRECACHE = [ROOT.href, sub('index.html'), sub('manifest.json'), sub('icon.svg')]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 导航（HTML 文档）：Network First，离线时回退缓存或首屏
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req.url, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req.url).then((r) => r || caches.match(sub('index.html')))),
    )
    return
  }

  // 带 hash 的构建产物（assets/*.js|css）：Cache First（文件名哈希即版本号，天然更新）
  const isHashedAsset = url.pathname.includes('/assets/')

  // 无 hash 的 public 二进制资源（3D 模型/视频/图片）：Network First，避免重部署后陈旧
  const isPublicBinary = /\.(glb|mp4|webm|webp|jpg|jpeg|png|woff2?)$/.test(url.pathname)

  if (isHashedAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req.url, copy)).catch(() => {})
            }
            return res
          })
          .catch(() => cached)
      }),
    )
    return
  }

  if (isPublicBinary) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req.url, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }

  // 其余（manifest/icon/fonts 等）：Cache First，未命中取网络并写入
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req.url, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
    }),
  )
})
