---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: ["src/lib/components/AppHeader.svelte","src/routes/login/+page.svelte","src/routes/bienvenida/+page.svelte","src/routes/ajustes/+page.svelte"]
---

# Surface brief · Portada (dashboard) and app shell

Scope: `/` plus the shared shell (header), and by inheritance `/login`, `/bienvenida`, `/ajustes`.
Mode: Operate. Task: start/stop working and glance at the week; team rivalry second.
Constraints: Phase 2 has no sessions yet, so every figure is real and may be zero; empty states must stay honest. JS budget < 150 KB gz.
Unresolved: period tabs (Mes/Año/Todo) and charts land in Phase 4; stopwatch becomes live in Phase 3.

## Direction contract

THESIS: A command-center console for three people: the week is drawn as hairline strands — one strand per session — that run from each member into one particle orb and fan out to the specialties. It refuses the card grid of KPI tiles that every time tracker ships.

OWN-WORLD: Near-pure black ground (#030405), one teal accent reserved for the orb and live state, member colors only on data strands and identity marks, 1 px hairlines in white at 6–16 % as the only structure. One glass slab (the right panel) and nothing else is glass. Inter for UI, Inter light italic for the greeting, JetBrains Mono only for running time and durations. Small sentence-case labels under numbers; no eyebrows, no glow on chrome.

STORY: The member understands in one glance how many hours the team has this week, who fed them, and into what kind of work; sees their own progress to the 4 h minimum and the rival gap; then starts the stopwatch from the header without leaving the page.

FIRST VIEWPORT: 56 px header (triangle + name left, text nav, stopwatch pill + theme + avatar right). Greeting row in italic light 30 px. Stage ~520 px tall, full width: member nodes at left (~4 %), strands converging into the orb (~31 %), fan of seven specialty nodes (~50–60 %), glass "Tu semana" slab at right (30 % width) with own progress, rival gap, live presence. Bottom strip of four metrics separated by vertical hairlines.

FORM: Category standard (canon), raised to the two reference consoles (Control AI Policy Platform, Cortex XSIAM). Seed key ca949e55. Signature interaction: hovering a member isolates their strands through the orb into their specialties while everything else dims; a running session sends a pulse along its strand.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
