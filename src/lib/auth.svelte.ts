import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Member } from './types';

/** Estado de sesión compartido por toda la app. */
class Auth {
	session = $state<Session | null>(null);
	member = $state<Member | null>(null);
	loading = $state(true);

	#started = false;

	async start() {
		if (this.#started) return;
		this.#started = true;

		// getSession espera a que supabase-js termine de leer ?code= de la URL (PKCE).
		const { data } = await supabase.auth.getSession();
		await this.#apply(data.session);

		supabase.auth.onAuthStateChange((_event, session) => {
			// No se puede llamar a Supabase dentro del callback (bloqueo interno):
			// se aplaza al siguiente tick.
			setTimeout(() => void this.#apply(session), 0);
		});
	}

	async #apply(session: Session | null) {
		const sameUser = session?.user.id === this.session?.user.id;
		this.session = session;

		if (!session) {
			this.member = null;
		} else if (!sameUser || !this.member) {
			await this.loadMember();
		}
		this.loading = false;
	}

	async loadMember() {
		const uid = this.session?.user.id;
		if (!uid) return;
		const { data, error } = await supabase.from('members').select('*').eq('id', uid).maybeSingle();
		if (error) console.error('[auth] no se pudo cargar el miembro', error);
		this.member = (data as Member | null) ?? null;
	}

	signInWithDiscord() {
		return supabase.auth.signInWithOAuth({
			provider: 'discord',
			options: {
				redirectTo: `${location.origin}/auth/callback`,
				scopes: 'identify'
			}
		});
	}

	async signOut() {
		await supabase.auth.signOut();
		this.session = null;
		this.member = null;
	}
}

export const auth = new Auth();
