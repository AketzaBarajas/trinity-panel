/** Escala "redonda" en horas para un máximo en minutos (3–5 marcas). */
export function hourScale(maxMinutes: number): { max: number; ticks: number[] } {
	const h = Math.max(maxMinutes, 1) / 60;
	const steps = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 24, 48, 100, 200, 500];
	const step = steps.find((s) => h / s <= 4) ?? 1000;
	const top = Math.max(step, Math.ceil(h / step) * step);
	const ticks: number[] = [];
	for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v * 60);
	return { max: top * 60, ticks };
}

/** 90 → "1,5 h"; 30 → "30 min" (etiquetas de eje). */
export function axisLabel(minutes: number): string {
	if (minutes === 0) return '0';
	if (minutes < 60) return `${Math.round(minutes)} min`;
	const h = minutes / 60;
	return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
}

/** Rectángulo con solo las esquinas de arriba redondeadas (barra anclada a la base). */
export function topRounded(x: number, y: number, w: number, h: number, r: number): string {
	if (h <= 0 || w <= 0) return '';
	const rr = Math.min(r, w / 2, h);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Porcentaje entero, "—" si no hay base. */
export const pct = (v: number, base: number) => (base > 0 ? `${Math.round((v / base) * 100)} %` : '—');
