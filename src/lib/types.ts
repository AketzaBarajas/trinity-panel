// Tipos de las tablas que usa el frontend en la Fase 2.
// Cuando el proyecto de Supabase esté enlazado se pueden generar solos con:
//   npx supabase gen types typescript --linked > src/lib/database.types.ts

export interface Member {
	id: string;
	discord_id: string;
	display_name: string;
	avatar_url: string | null;
	role_label: string | null;
	color: string | null;
	weekly_goal_minutes: number | null;
	is_admin: boolean;
	is_owner: boolean;
	onboarded_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface MemberColor {
	hex: string;
	name: string;
	sort: number;
}

export type PublicMember = Pick<
	Member,
	'id' | 'display_name' | 'avatar_url' | 'role_label' | 'color' | 'is_admin' | 'is_owner' | 'onboarded_at'
>;
