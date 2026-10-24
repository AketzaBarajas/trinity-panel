import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo/client.ts';

/**
 * Modo demo: solo con `npm run dev` y abriendo la web con `?demo`. Usa un
 * Postgres en el navegador con datos inventados (ver src/lib/demo/). En la
 * compilación de producción esta rama desaparece.
 */
export const DEMO: boolean = import.meta.env.DEV && typeof window !== 'undefined' && demoFlag();

function demoFlag(): boolean {
	try {
		const on = new URLSearchParams(location.search).has('demo');
		if (on) sessionStorage.setItem('tp-demo', '1');
		return on || sessionStorage.getItem('tp-demo') === '1';
	} catch {
		return false;
	}
}

function realClient(): SupabaseClient {
	const url = import.meta.env.VITE_SUPABASE_URL;
	const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

	if (!url || !key) {
		throw new Error(
			'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env y rellénalo (o abre la web con ?demo).'
		);
	}

	return createClient(url, key, {
		auth: {
			flowType: 'pkce',
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true
		}
	});
}

// `import.meta.env.DEV` va escrito aquí (y no solo dentro de DEMO) para que la
// compilación de producción elimine el modo demo y PGlite por completo.
export const supabase: SupabaseClient =
	import.meta.env.DEV && DEMO ? (createDemoClient() as unknown as SupabaseClient) : realClient();
