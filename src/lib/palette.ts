/**
 * Colores de miembro. La base de datos guarda el hex del modo oscuro como clave;
 * el CSS define `--m-<HEX>` para cada tema (validado con el script de dataviz:
 * daltonismo, separación y contraste en negro y en claro).
 */

/** Equivalencias de la paleta antigua por si algún dato viejo sobrevive. */
const LEGACY: Record<string, string> = {
	'#34D399': '#1FA374',
	'#60A5FA': '#3A70F0',
	'#C084FC': '#CB62C2',
	'#818CF8': '#3A70F0',
	'#A3E635': '#B0900C'
};

export function normalizeHex(hex: string | null | undefined): string | null {
	if (!hex) return null;
	const up = hex.toUpperCase();
	return LEGACY[up] ?? up;
}

export function memberColor(hex: string | null | undefined): string {
	const h = normalizeHex(hex);
	if (!h) return 'var(--ink-4)';
	return `var(--m-${h.slice(1)}, ${h})`;
}

export function initial(name: string): string {
	return name.trim().charAt(0).toUpperCase();
}
