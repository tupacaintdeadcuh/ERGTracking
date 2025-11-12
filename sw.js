self.addEventListener('install',e=>{e.waitUntil(caches.open('erg-final').then(c=>c.addAll([
  './index.html','./admin.html','./styles.css','./app.js','./admin.js','./manifest.webmanifest','./icon-192.ppm','./icon-512.ppm'
])))});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))})