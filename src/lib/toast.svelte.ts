export type ToastTone = 'ok' | 'info' | 'bad';

export interface ToastAction {
	label: string;
	run: () => void;
}

export interface Toast {
	id: number;
	text: string;
	tone: ToastTone;
	action?: ToastAction;
}

interface Timer {
	left: number;
	since: number;
	handle: ReturnType<typeof setTimeout> | null;
}

const MAX = 3;

/** Avisos cortos abajo a la derecha. Se pausan con el ratón encima o la pestaña oculta. */
class Toasts {
	list = $state<Toast[]>([]);
	#seq = 0;
	#timers = new Map<number, Timer>();
	#paused = false;

	/** `duration = Infinity` deja el aviso fijo hasta que se cierre (o se pulse su acción). */
	show(text: string, tone: ToastTone = 'info', duration = tone === 'bad' ? 6000 : 4000, action?: ToastAction) {
		const id = ++this.#seq;
		this.list = [...this.list, { id, text, tone, action }];
		while (this.list.length > MAX) this.dismiss(this.list[0].id);
		if (Number.isFinite(duration)) {
			this.#timers.set(id, { left: duration, since: Date.now(), handle: null });
			if (!this.#paused) this.#arm(id);
		}
		return id;
	}

	dismiss(id: number) {
		const t = this.#timers.get(id);
		if (t?.handle) clearTimeout(t.handle);
		this.#timers.delete(id);
		this.list = this.list.filter((x) => x.id !== id);
	}

	pause() {
		if (this.#paused) return;
		this.#paused = true;
		const now = Date.now();
		for (const t of this.#timers.values()) {
			if (t.handle) clearTimeout(t.handle);
			t.handle = null;
			t.left -= now - t.since;
		}
	}

	resume() {
		if (!this.#paused) return;
		this.#paused = false;
		for (const id of this.#timers.keys()) this.#arm(id);
	}

	#arm(id: number) {
		const t = this.#timers.get(id);
		if (!t) return;
		t.since = Date.now();
		t.handle = setTimeout(() => this.dismiss(id), Math.max(t.left, 1200));
	}
}

export const toasts = new Toasts();
export const toast = (text: string, tone?: ToastTone) => toasts.show(text, tone);
