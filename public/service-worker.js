/**
 * SERVICE WORKER - OFFLINE CAPABILITY & CACHING
 * Versi: 1.1.0
 * Handle offline mode dan sync data ke Google Sheets
 */

// NAIKKAN angka di belakang string ini (v2, v3, dst) SETIAP kali ada
// perubahan besar - itu memicu activate() membuang cache lama, jadi user
// yang sudah pernah buka app tidak nyangkut di versi lama selamanya.
const CACHE_VERSION = 'tabungan-qurban-v2';
const CACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css',
    '/offline.html'
];

const API_CACHE = 'tabungan-api-v1';
const INDEXEDDB_NAME = 'TabunganQurban';
const INDEXEDDB_VERSION = 1;

// ===== INSTALL =====
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => {
                console.log('[SW] Caching assets');
                return cache.addAll(CACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_VERSION && cacheName !== API_CACHE) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API calls - Network first, fallback to IndexedDB
    if (url.pathname.includes('/api/') || url.hostname.includes('script.google.com')) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // App shell (index.html / navigasi) - SELALU coba jaringan dulu dan
    // update cache-nya. Cache cuma dipakai sbg fallback pas offline, BUKAN
    // sumber utama - sebelumnya index.html pakai cache-first, akibatnya
    // browser/PWA yang sudah pernah buka app selalu menampilkan versi LAMA
    // walau sudah ada deploy baru, sampai semua tab ditutup total.
    if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
        event.respondWith(networkFirstShellStrategy(request));
        return;
    }

    // Aset statis lain (manifest, css, offline.html, dst) - cache-first
    // tetap aman karena jarang berubah.
    event.respondWith(cacheFirstStrategy(request));
});

// Khusus app shell (index.html/navigasi) - beda dari networkFirstStrategy
// (yang dipakai buat API, ada logika IndexedDB/sync khusus API). Di sini
// simpel: fetch terbaru dari jaringan, update cache, fallback ke cache atau
// offline.html cuma kalau jaringan benar-benar gagal.
async function networkFirstShellStrategy(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.log('[SW] Network gagal utk app shell, fallback ke cache:', error);
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('/offline.html');
    }
}

async function networkFirstStrategy(request) {
    try {
        // Try network first
        const response = await fetch(request.clone());
        
        if (response.ok) {
            // Cache successful API responses
            const cache = await caches.open(API_CACHE);
            cache.put(request.url, response.clone());
            
            // Also save to IndexedDB for offline sync
            if (request.method === 'POST') {
                const data = await request.clone().json();
                await saveToIndexedDB('pending_requests', data);
            }
            
            return response;
        }
    } catch (error) {
        console.log('[SW] Network failed, trying cache/IndexedDB:', error);
    }
    
    // Fallback to cache
    let cached = await caches.match(request.url);
    if (cached) return cached;
    
    // Fallback to IndexedDB for read operations
    if (request.method === 'GET') {
        const data = await getFromIndexedDB('cached_data', url.pathname);
        if (data) {
            return new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response('Offline - Data unavailable', { status: 503 });
}

async function cacheFirstStrategy(request) {
    const cached = await caches.match(request.url);
    
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request.url, response.clone());
        return response;
    } catch (error) {
        console.log('[SW] Fetch failed:', error);
        return caches.match('/offline.html');
    }
}

// ===== MESSAGE HANDLER =====
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data.action === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.action === 'SYNC_DATA') {
        event.waitUntil(syncPendingData());
    }
    
    if (event.data.action === 'CLEAR_CACHE') {
        event.waitUntil(clearAllCache());
    }
});

// ===== INDEXEDDB OPERATIONS =====
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores
            if (!db.objectStoreNames.contains('pending_requests')) {
                db.createObjectStore('pending_requests', { autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('cached_data')) {
                db.createObjectStore('cached_data', { keyPath: 'url' });
            }
            if (!db.objectStoreNames.contains('sync_queue')) {
                db.createObjectStore('sync_queue', { autoIncrement: true });
            }
        };
    });
}

async function saveToIndexedDB(storeName, data) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[SW] IndexedDB save error:', error);
    }
}

async function getFromIndexedDB(storeName, key) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[SW] IndexedDB get error:', error);
        return null;
    }
}

async function getAllFromIndexedDB(storeName) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[SW] IndexedDB getAll error:', error);
        return [];
    }
}

async function clearIndexedDBStore(storeName) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[SW] IndexedDB clear error:', error);
    }
}

// ===== SYNC =====
async function syncPendingData() {
    console.log('[SW] Syncing pending data...');
    
    try {
        const pendingRequests = await getAllFromIndexedDB('pending_requests');
        
        if (pendingRequests.length === 0) {
            console.log('[SW] No pending requests to sync');
            return;
        }
        
        for (const request of pendingRequests) {
            try {
                // Retry pending requests
                const response = await fetch(request.url || '/api/sync', {
                    method: request.method || 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(request)
                });
                
                if (response.ok) {
                    // Remove from pending after successful sync
                    await clearIndexedDBStore('pending_requests');
                }
            } catch (error) {
                console.error('[SW] Sync request failed:', error);
            }
        }
        
        // Notify clients of sync completion
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({ type: 'SYNC_COMPLETE', data: pendingRequests });
        });
        
    } catch (error) {
        console.error('[SW] Sync error:', error);
    }
}

async function clearAllCache() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(name => caches.delete(name))
        );
        console.log('[SW] All caches cleared');
    } catch (error) {
        console.error('[SW] Cache clear error:', error);
    }
}

// ===== PERIODIC SYNC (Background Sync) =====
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync event:', event.tag);
    
    if (event.tag === 'sync-data') {
        event.waitUntil(syncPendingData());
    }
});

console.log('[SW] Service Worker loaded and ready!');
