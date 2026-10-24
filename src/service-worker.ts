/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

// App instalable que arranca al instante: la "carcasa" (HTML + JS + CSS +
// fuentes) se sirve desde la caché y los datos llegan siempre en vivo de
// Supabase. No funciona sin conexión (eso es v2): solo arranca sin esperar.
//
// Una versión nueva se instala en segundo plano y espera; la web avisa con
// "Nueva versión · Recargar" y, al pulsarlo, toma el control.

import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `trinity-panel-${version}`;
const SHELL = '/';

const abs = (p: string) => (p.startsWith('/') ? p : `/${p}`);

// `_headers` es configuración de Cloudflare Pages, no se sirve: no se cachea.
// Las fuentes en cirílico, griego y vietnamita no se usan: el navegador las
// pediría a la red solo si hiciera falta.
const ASSETS = [
	...immutable.map((f) => abs(f.path)).filter((p) => !/-(cyrillic|greek|vietnamese)/.test(p)),
	...assets.map((f) => abs(f.path)).filter((p) => !p.startsWith('/_') && !p.endsWith('robots.txt'))
];
const IN_CACHE = new Set(ASSETS);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll([...ASSETS, SHELL]))
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	// Supabase, avatares de Discord, etc.: directo a la red, nunca a la caché.
	if (url.origin !== sw.location.origin) return;

	// Cualquier página de la app = la misma carcasa (es una SPA).
	if (req.mode === 'navigate') {
		event.respondWith(
			(async () => {
				const cached = await caches.match(SHELL, { cacheName: CACHE });
				if (cached) return cached;
				return fetch(req);
			})()
		);
		return;
	}

	if (IN_CACHE.has(url.pathname)) {
		event.respondWith(
			(async () => (await caches.match(url.pathname, { cacheName: CACHE })) ?? fetch(req))()
		);
	}
});
