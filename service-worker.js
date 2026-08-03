const CACHE='stopflow-v0112-2';
const CORE=['/stopflow-compact.css','/stopflow-mobile.css','/stopflow-mobile.js','/stopflow-ops.js','/stopflow-checklists.js','/supabase-orders.js','/supabase-catalog.js','/supabase-article-tools.js','/supabase-users.js','/supabase-user-delete.js','/manifest.webmanifest','/stopflow-app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==location.origin)return;
 if(request.mode==='navigate'||url.pathname==='/'||url.pathname==='/index.html'){
   event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match('/index.html')));
   return;
 }
 event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response}).catch(()=>caches.match(request)));
});