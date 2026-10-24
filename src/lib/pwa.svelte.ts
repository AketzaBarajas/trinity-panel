import { dev } from '$app/env';
import { toasts } from './toast.svelte.ts';

/** Evento de Chrome/Edge para ofrecer "Instalar" desde un botón propio. */
interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const HOUR = 60 * 60 * 1000;

/** App instalable: botón de instalar y aviso de versión nueva. */
class Pwa {
	/** Se puede instalar ahora mismo con `install()`. */
	canInstall = $state(false);
	/** Abierta como app instalada (ventana propia). */
	standalone = $state(false);
	/** Hay una versión nueva descargada esperando. */
	updateReady = $state(false);

	#prompt: InstallPromptEvent | null = null;
	#reg: ServiceWorkerRegistration | null = null;
	#reloading = false;
	#lastCheck = 0;

	constructor() {
		if (typeof window === 'undefined') return;

		// Hay que escucharlo cuanto antes: Chrome lo lanza nada más cargar.
		addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			this.#prompt = e as InstallPromptEvent;
			this.canInstall = true;
		});
		addEventListener('appinstalled', () => {
			this.#prompt = null;
			this.canInstall = false;
			toasts.show('trinity-panel instalada. Ya la tienes en el menú Inicio.', 'ok');
		});

		const mq = matchMedia('(display-mode: standalone)');
		this.standalone = mq.matches;
		mq.addEventListener('change', (e) => (this.standalone = e.matches));
	}

	async init() {
		if (dev || !('serviceWorker' in navigator)) return;
		try {
			this.#reg = await navigator.serviceWorker.register('/service-worker.js');
		} catch (e) {
			console.warn('[pwa] no se pudo registrar el service worker', e);
			return;
		}

		const reg = this.#reg;
		// Ya había una versión esperando de una visita anterior.
		if (reg.waiting && navigator.serviceWorker.controller) this.#ready();

		reg.addEventListener('updatefound', () => {
			const next = reg.installing;
			next?.addEventListener('statechange', () => {
				// Con controlador previo = es una actualización, no la primera instalación.
				if (next.state === 'installed' && navigator.serviceWorker.controller) this.#ready();
			});
		});

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!this.#reloading) return;
			location.reload();
		});

		// La app instalada se queda abierta días: busca versión nueva al volver a ella.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && Date.now() - this.#lastCheck > HOUR) {
				this.#lastCheck = Date.now();
				void reg.update().catch(() => {});
			}
		});
	}

	async install(): Promise<boolean> {
		const p = this.#prompt;
		if (!p) return false;
		await p.prompt();
		const { outcome } = await p.userChoice;
		this.#prompt = null;
		this.canInstall = false;
		return outcome === 'accepted';
	}

	/** Activa la versión nueva y recarga. */
	update() {
		const waiting = this.#reg?.waiting;
		if (!waiting) return location.reload();
		this.#reloading = true;
		waiting.postMessage('skip-waiting');
	}

	#ready() {
		if (this.updateReady) return;
		this.updateReady = true;
		toasts.show('Hay una versión nueva de trinity-panel.', 'info', Infinity, {
			label: 'Recargar',
			run: () => this.update()
		});
	}
}

export const pwa = new Pwa();
