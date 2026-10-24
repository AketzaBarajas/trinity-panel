import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// PGlite (modo demo) trae su propio WebAssembly: Vite no debe pre-empaquetarlo.
	optimizeDeps: { exclude: ['@electric-sql/pglite'] },
	// El modo demo lee las migraciones de supabase/ para montar su base de datos.
	server: { fs: { allow: ['supabase'] } },
	plugins: [
		// Al compilar, el modo demo se sustituye por un módulo vacío: así PGlite
		// (≈ 13 MB de WebAssembly) nunca llega a la web publicada.
		{
			name: 'trinity-sin-demo',
			apply: 'build',
			enforce: 'pre',
			load(id) {
				if (id.replace(/\\/g, '/').endsWith('/src/lib/demo/client.ts')) {
					return "export function createDemoClient() { throw new Error('El modo demo solo existe en npm run dev'); }";
				}
			}
		},
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// SPA estática para Cloudflare Pages: todo se pinta en el navegador y
			// Supabase hace de backend. Pages sirve index.html para cualquier ruta.
			adapter: adapter({ fallback: 'index.html' }),

			// El service worker lo registra src/lib/pwa.svelte.ts solo en producción
			// (en desarrollo la caché estorbaría a la recarga en caliente).
			serviceWorker: { register: false }
		})
	]
});
