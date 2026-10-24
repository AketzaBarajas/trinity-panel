# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three people, and only three: Ake (admin principal) and two teammates, the members of TRINITY. University-age friends who build projects together (today InfoCraft, a Minecraft mod-guide site; later others). They use it on their own computers, installed as a desktop PWA; there is no mobile design in v1.

## Product Purpose

The shared work-hours register that their team pact ("PACTO DE FAMILIA") requires. It records real time worked with a server-side stopwatch, what was done in each session, and whether each member meets the weekly minimum (4 h, Monday–Sunday). What is not in the register does not count. Done means: the three use it for a full week without going back to a spreadsheet or Discord to log hours.

## Positioning

Not a generic time tracker: it encodes one specific pact between three friends — weekly minimum, one-week make-up of deficits, justified absences, warning then penalty — and makes everyone's effort visible to the other two.

## Operating Context

- Primary moment: a member opens the app to **start or stop working**, and glances at how their week is going. The stopwatch is the main action; team status is secondary.
- Sessions: start → (work elsewhere) → stop → "¿Qué has hecho?" (short phrase, one or more specialties, optional description, project).
- The timer lives on the server: closing the tab or switching device does not stop it. Auto-cut at 4 h leaves the session "para revisar".
- Live presence: everyone sees who is working right now.
- Discord: login, notifications on start/stop, Sunday weekly summary, Thursday reminder.
- Admins (all three; Ake is principal) validate manual / auto-cut sessions, adjust the minimum and mark absences.

## Capabilities and Constraints

- Stack: SvelteKit 3 static SPA + Supabase (Postgres, RLS, Discord OAuth, realtime) + Cloudflare Pages (`trinity-panel.pages.dev`). Cost 0 €.
- Performance budget: initial JS < 150 KB gz, Lighthouse ≥ 90, dashboard < 1 s, start/stop instant (optimistic).
- Language: Spanish (es-ES); times shown in Europe/Madrid.
- Each member picks a unique color (Verde #1FA374, Azul #3A70F0, Orquídea #CB62C2, Oro #B0900C — validated for color-vision deficiency on both themes) and a free-text role; their color identifies them in every chart.
- Seven specialties with fixed colors: Página web, Creación de contenido, Vídeo/redes, Mantenimiento, Pruebas en el juego, Reuniones/organización, Formación.
- Light and dark mode with a toggle; dark is default.
- Typefaces fixed by the team: Inter (text and durations, tabular) and JetBrains Mono (only ticking clocks). See DESIGN.md.

## Brand Commitments

- Name: `trinity-panel`; team: TRINITY; symbol: a triangle whose three sides are the three members' colors.
- Approved reference: artboard "D · Final" (https://claude.ai/artifact/LKatRrnLh6PWLrg3tcu1hD) — structure of proposal C, near-black green ground, flow from members → central orb → specialties, glass panels, metrics with sparklines. The owner wants the coded UI to go **one level above** that reference and to stop looking generic / AI-made.
- **Standing visual preference (2026-10-24):** the owner chose the category standard over invented worlds, with two binding references as the craft bar: "Control AI Policy Platform" (orb with a fan of hairline strands to many nodes, glass side panel of metrics) and "Cortex XSIAM Command Center" (pure black, bundles of 1 px strands converging into a particle orb then splitting, metrics with sparklines, italic greeting). It must look like a premium ops command center, never like a generic AI-made dashboard.
- Voice: **competitive with healthy rivalry** — a scoreboard between friends ("Marco te saca 2 h", streaks, ranking), never humiliating; the pact's warnings are stated plainly.

## Evidence on Hand

- Real data only after Phase 3 (stopwatch). No invented hours, testimonials or stats in shipped UI; empty states must be honest.

## Product Principles

1. The stopwatch is the product: starting and stopping must be one obvious, instant action from anywhere.
2. Transparency is the point of the pact: everyone sees everything, including who is behind.
3. Rivalry motivates, numbers decide: compare people with exact figures, not vague praise.
4. The rules are the pact's rules: the app enforces and explains them, it does not invent new ones.
5. Light and fast: it must open instantly and cost nothing to run.
