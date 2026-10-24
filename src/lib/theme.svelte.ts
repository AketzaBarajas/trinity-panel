export type Theme = 'dark' | 'light';

const KEY = 'tp-theme';

function read(): Theme {
	try {
		const v = localStorage.getItem(KEY);
		if (v === 'dark' || v === 'light') return v;
	} catch {
		/* almacenamiento bloqueado: usamos el oscuro */
	}
	return 'dark';
}

class ThemeState {
	current = $state<Theme>('dark');

	init() {
		this.current = read();
		document.documentElement.dataset.theme = this.current;
	}

	toggle() {
		this.current = this.current === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = this.current;
		try {
			localStorage.setItem(KEY, this.current);
		} catch {
			/* sin persistencia, no pasa nada */
		}
	}
}

export const theme = new ThemeState();
