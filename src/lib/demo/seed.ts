// Datos inventados del modo demo. Tres miembros ficticios (Lucía, Marco y
// Nora) con 9 semanas de sesiones pensadas para que se vean todos los estados
// del pacto: cumplida, recuperada, justificada, toque de atención y en curso.

import { addDaysISO, currentWeek, fromMadridInputs, madridDateISO } from '../time.ts';

export const DEMO_USER = 'd0000000-0000-4000-8000-00000000000a';
export const MARCO = 'd0000000-0000-4000-8000-00000000000b';
export const NORA = 'd0000000-0000-4000-8000-00000000000c';
const BOT_PROJECT = 'd0000000-0000-4000-8000-0000000000f1';

interface Person {
	id: string;
	discord: string;
	name: string;
	color: string;
	role: string;
	hour: number; // hora a la que suele empezar
	specs: string[];
	/** Minutos por semana, de la más antigua a la actual (9 semanas). */
	weeks: number[];
}

const PEOPLE: Person[] = [
	{
		id: DEMO_USER,
		discord: '100000000000000001',
		name: 'Lucía',
		color: '#1FA374',
		role: 'Web',
		hour: 18,
		specs: ['web', 'mantenimiento', 'formacion'],
		weeks: [300, 270, 330, 265, 360, 290, 310, 285, 190]
	},
	{
		id: MARCO,
		discord: '100000000000000002',
		name: 'Marco',
		color: '#3A70F0',
		role: 'Vídeo y redes',
		hour: 16,
		specs: ['video', 'pruebas', 'reuniones'],
		// Semana 3 floja → recuperada en la 4. Semana 7 floja → no recupera en la 8: toque.
		weeks: [265, 260, 120, 380, 265, 260, 150, 250, 140]
	},
	{
		id: NORA,
		discord: '100000000000000003',
		name: 'Nora',
		color: '#CB62C2',
		role: 'Contenido',
		hour: 10,
		specs: ['contenido', 'pruebas', 'web'],
		// Semana 4 de viaje (justificada).
		weeks: [260, 265, 270, 0, 260, 300, 265, 260, 160]
	}
];

const TITLES: Record<string, string[]> = {
	web: ['Página de guías: filtros por versión', 'Arreglar el menú en móvil', 'Despliegue en Cloudflare', 'Buscador de mods'],
	contenido: ['Guía de Create: primeros pasos', 'Guía de Sodium terminada', 'Capturas para la guía de shaders', 'Textos de la portada'],
	video: ['Vídeo TikTok: top 5 mods', 'Edición del vídeo de Sodium', 'Grabar tutorial de instalación'],
	mantenimiento: ['Actualizar mods a 1.21', 'Corregir enlaces rotos', 'Comprimir imágenes pesadas'],
	pruebas: ['Probar Create para la guía', 'Pruebas de rendimiento con Sodium'],
	reuniones: ['Reunión semanal del equipo', 'Planificación del mes'],
	formacion: ['Aprender Astro para la web', 'Curso de edición de vídeo']
};

const DESCRIPTIONS = [
	null,
	null,
	'Queda pendiente revisar los enlaces.',
	'Hecho con la plantilla nueva; falta pasarla a la web.',
	null,
	'Probado en 1.21 y 1.20.1.'
];

function prng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const q = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`);
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function seedSQL(now = new Date()): string {
	const rand = prng(7);
	const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

	const week = currentWeek(now);
	const curMonday = madridDateISO(week.start);
	const today = madridDateISO(now);
	const todayIdx = Math.round((Date.parse(today) - Date.parse(curMonday)) / 86400000);
	const monday = (i: number) => addDaysISO(curMonday, -7 * (8 - i));
	const start = monday(0);

	const out: string[] = [];

	// Miembros: la lista cerrada y el alta (el trigger crea la ficha).
	out.push(
		`insert into public.allowed_members (discord_id, display_name, is_admin, is_owner) values ${PEOPLE.map(
			(p, i) => `('${p.discord}', '${p.name}', true, ${i === 0})`
		).join(', ')};`,
		`insert into auth.users (id, raw_user_meta_data) values ${PEOPLE.map(
			(p) => `('${p.id}', '{"provider_id": "${p.discord}"}')`
		).join(', ')};`,
		...PEOPLE.map(
			(p) =>
				`update public.members set color = '${p.color}', role_label = ${q(p.role)}, onboarded_at = now(),
				   created_at = '${addDaysISO(start, -3)}T10:00:00Z' where id = '${p.id}';`
		),
		`update public.members set weekly_goal_minutes = 330 where id = '${DEMO_USER}';`,
		`insert into public.projects (id, name, created_at) values ('${BOT_PROJECT}', 'Bot de Discord', now() - interval '30 days');`,
		`update public.app_settings set pact_starts_on = '${start}' where id;`
	);

	// Sesiones: los minutos de cada semana repartidos en 3–5 días.
	const sessions: string[] = [];
	const specs: string[] = [];
	let n = 0;
	for (const p of PEOPLE) {
		p.weeks.forEach((total, w) => {
			if (!total) return;
			const isCurrent = w === 8;
			const days = Array.from({ length: isCurrent ? todayIdx : 7 }, (_, i) => i);
			if (!days.length) return;
			const k = Math.min(days.length, 3 + Math.floor(rand() * 3));
			const chosen = days.sort(() => rand() - 0.5).slice(0, k).sort((a, b) => a - b);
			const weights = chosen.map(() => 0.6 + rand());
			const sum = weights.reduce((a, b) => a + b, 0);

			chosen.forEach((d, j) => {
				const mins = Math.max(20, Math.round((total * weights[j]) / sum / 5) * 5);
				const day = addDaysISO(monday(w), d);
				const startMin = p.hour * 60 + Math.floor(rand() * 8) * 15;
				const a = fromMadridInputs(day, hm(startMin))!;
				const b = new Date(a.getTime() + mins * 60000);
				const spec = pick(p.specs);
				const extra = rand() < 0.3 ? pick(p.specs.filter((s) => s !== spec)) : null;
				const id = `d0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
				const project = p.id === DEMO_USER && rand() < 0.2 ? `'${BOT_PROJECT}'` : `(select id from public.projects where name = 'InfoCraft')`;
				// Una sesión a mano de Nora la semana pasada, aún por validar.
				const manual = p.id === NORA && w === 7 && j === 0;
				sessions.push(
					`('${id}', '${p.id}', ${project}, '${a.toISOString()}', '${b.toISOString()}', ${q(pick(TITLES[spec]))}, ${q(
						pick(DESCRIPTIONS)
					)}, ${manual}, ${manual}, '${b.toISOString()}')`
				);
				specs.push(`('${id}', '${spec}')`);
				if (extra) specs.push(`('${id}', '${extra}')`);
			});
		});
	}

	out.push(
		`insert into public.sessions (id, member_id, project_id, started_at, ended_at, title, description, is_manual, needs_review, created_at) values
		 ${sessions.join(',\n')};`,
		`insert into public.session_specialties (session_id, specialty_slug) values ${specs.join(', ')};`,
		// Marco está trabajando ahora mismo.
		`insert into public.sessions (member_id, project_id, started_at, created_at)
		 values ('${MARCO}', (select id from public.projects where name = 'InfoCraft'), now() - interval '42 minutes', now() - interval '42 minutes');`,
		// Ausencias: Nora de viaje la semana 4; Lucía tiene exámenes la semana que viene.
		`insert into public.absences (member_id, starts_on, ends_on, reason, created_by) values
		 ('${NORA}', '${monday(3)}', '${addDaysISO(monday(3), 6)}', 'viaje', '${NORA}'),
		 ('${DEMO_USER}', '${addDaysISO(curMonday, 9)}', '${addDaysISO(curMonday, 10)}', 'examenes', '${DEMO_USER}');`,
		// Una sesión eliminada por un admin (se ve en Sesiones).
		`insert into public.session_deletions (session_id, member_id, started_at, ended_at, title, specialties, reason, deleted_by, deleted_at)
		 values (gen_random_uuid(), '${MARCO}', now() - interval '3 days 2 hours', now() - interval '3 days 1 hour', 'Grabar tutorial de instalación',
		         '{video}', 'Duplicada: ya estaba registrada a mano', '${DEMO_USER}', now() - interval '3 days');`,
		// Discord conectado y el último aviso entregado.
		`insert into private.discord_webhook (url, set_by, set_at)
		 values ('https://discord.com/api/webhooks/100000000000000000/demo-demo-demo-demo-demo-demo-demo', '${DEMO_USER}', now() - interval '6 days');
		 insert into net._http_response values (1, 204, null, false);
		 insert into private.discord_log (key, kind, request_id, sent_at) values ('inicio:demo', 'inicio', 1, now() - interval '41 minutes');`,
		// Una copia semanal además de la que hace la migración.
		`select private.take_backup('semanal');
		 update public.backups set taken_at = '${curMonday}T03:00:00Z' where kind = 'semanal';`
	);

	return out.join('\n');
}
