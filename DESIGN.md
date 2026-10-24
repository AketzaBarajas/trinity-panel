---
name: trinity-panel
description: Command-center console for the TRINITY pact — three members' hours drawn as hairline strands into one orb.
colors:
  console-black: "#030405"
  raised-graphite: "#0a0d0e"
  sunken-black: "#000000"
  glass-slab: "rgba(16, 22, 23, 0.72)"
  hairline: "rgba(255, 255, 255, 0.07)"
  hairline-structure: "rgba(255, 255, 255, 0.12)"
  hairline-strong: "rgba(255, 255, 255, 0.22)"
  strand-neutral: "rgba(220, 235, 233, 0.16)"
  ink: "#f2f5f4"
  ink-secondary: "#a9b4b2"
  ink-tertiary: "#7c8987"
  ink-faint: "#4d5856"
  live-teal: "#2dd4bf"
  live-teal-soft: "rgba(45, 212, 191, 0.14)"
  go-green: "#1fa374"
  go-ink: "#04110b"
  bad-coral: "#f0675f"
  bad-soft: "rgba(240, 103, 95, 0.1)"
  discord-blurple: "#5865f2"
  member-verde: "#1fa374"
  member-azul: "#3a70f0"
  member-orquidea: "#cb62c2"
  member-oro: "#b0900c"
typography:
  greeting:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 300
    letterSpacing: "-0.025em"
  display-number:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "'tnum', 'cv11'"
  metric-number:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    letterSpacing: "-0.03em"
    fontFeature: "'tnum', 'cv11'"
  title:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'cv11', 'ss01'"
  label:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  clock:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 500
    letterSpacing: "-0.01em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "999px"
spacing:
  page-x: "28px"
  page-x-mobile: "16px"
  gutter: "24px"
  slab-pad: "22px"
  stack: "20px"
components:
  button:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.console-black}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-go:
    backgroundColor: "{colors.go-green}"
    textColor: "{colors.go-ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-quiet:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    height: "36px"
  button-lg:
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.sunken-black}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  stopwatch-pill:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.clock}"
    rounded: "{rounded.pill}"
    height: "40px"
  member-node:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    width: "200px"
    height: "62px"
  glass-slab:
    backgroundColor: "{colors.glass-slab}"
    rounded: "{rounded.lg}"
    padding: "{spacing.slab-pad}"
---

# Design System: trinity-panel

## Overview

**Creative North Star: "The Night Console"**

A premium ops command center for exactly three people. The ground is near-pure black; all structure is 1 px hairlines in white at low opacity; color appears only where there is data or identity. The week is drawn, not tiled: one hairline strand per real session runs from each member node into a particle orb and fans out to the specialties. The category standard (orb, strands, glass side panel, sparkline metrics) is the chosen world, built to the craft bar of the two reference consoles (Control AI Policy Platform, Cortex XSIAM).

Density is calm and precise: 13 px body, small sentence-case labels under exact numbers, generous dark space around the stage. Motion is slow and functional: the orb's particles rotate (160 s idle, 60 s when someone is live), a running session sends a pulse along its strand, hovering a member isolates their strands end to end. Light mode is a full, separately tuned theme, not an inversion; dark is default.

**Key Characteristics:**
- Near-black ground, hairline-only structure, no tile grid of KPI cards.
- Color is data: member colors on strands, dots, bars, avatar rings; nothing else is colored.
- One accent (live teal) for the orb and live state; one action green for starting the stopwatch.
- Exactly one glass surface.
- Inter everywhere; JetBrains Mono only for ticking clocks.

## Colors

A near-monochrome console where hue is reserved for data, identity and one live signal. Frontmatter values are the dark theme (default); light values live under `:root[data-theme='light']` in `src/app.css` and in the sidecar.

### Primary
- **Live Teal** (`--live`): the orb's live ring, the running stopwatch dot, focus outlines, caret, selection tint (`--live-soft`), input focus ring, default sparkline. It means "now". Light: #0d8a7c.

### Secondary
- **Go Green** (`--go`, text `--go-ink`): only on start-stopwatch actions (header "Iniciar" pill, `.btn-go`). Light: #11865a on white.

### Tertiary
- **Member palette** (`--m-<HEX>`): Verde #1FA374, Azul #3A70F0, Orquídea #CB62C2, Oro #B0900C. The database stores the dark-mode hex as the key; `memberColor()` in `src/lib/palette.ts` resolves it to `var(--m-<HEX>)`, which each theme defines separately (light: #11865a, #2c5fd6, #a8459f, #9c6500). The set passed the dataviz validator for CVD separation, lightness and contrast in both modes. Unassigned/pending members fall back to `--ink-4`.

### Neutral
- **Console Black** (`--bg`): page ground and the opaque header.
- **Raised Graphite** (`--bg-raised`): buttons, member nodes, stopwatch pill.
- **Sunken Black** (`--bg-sunken`): input wells.
- **Hairline / Structure / Strong** (`--line`, `--line-2`, `--line-3`): dividers; component borders and empty channels; hover borders and orb tick marks.
- **Neutral Strand** (`--strand`): orb-to-specialty strands with data.
- **Ink ramp** (`--ink` → `--ink-4`): primary text; secondary labels; tertiary text, sub-labels and placeholders (≥4.5:1 in both themes); faint (decorative only, never text that must be read).
- **Bad Coral** (`--bad`, `--bad-soft`): alert icon, border tint and fill. **Discord Blurple** (`--discord`): the Discord sign-in button only.

### Named Rules
**The Color-Is-Data Rule.** Member colors appear only in data (strands, bars, sparklines, orb particles, pips, swatches) and identity marks (dots, avatar rings, the triangle logo). Chrome, text and surfaces stay neutral.

**The One Accent Rule.** Live Teal belongs to the orb and live state (plus focus/caret). Go Green belongs to starting the stopwatch. Neither decorates anything else.

**The Hex-Key Rule.** Never render a stored member hex directly; always go through `memberColor()` so the light theme gets its own validated value.

## Typography

**Body Font:** Inter Variable (with Inter, system-ui, Segoe UI), features `cv11`, `ss01`
**Mono Font:** JetBrains Mono Variable (with JetBrains Mono, ui-monospace, Cascadia Code)

**Character:** One neutral grotesk carries everything, with weight and tabular figures doing the hierarchy; a light italic greeting gives the console its single human voice.

### Hierarchy
- **Greeting** (Inter 300 italic, 30 px, -0.025em): page h1 ("Buenas tardes, Ake", "Ajustes"). Login uses 44 px, welcome 36 px, same treatment.
- **Display number** (500, 44 px, line-height 1, -0.04em, tabular): own weekly total in the slab.
- **Metric number** (500, 24 px, -0.03em, tabular): bottom-strip metrics; orb total 26 px/600; node hours 17 px/600.
- **Title** (600, 15 px): slab heading; section h2 14 px; block h3 12 px/600 in `--ink-2`.
- **Body** (400, 13 px, 1.5): default UI text; ledes 14–15 px in `--ink-2`, max 34–42ch.
- **Label** (400, 12 px, `--ink-2`/`--ink-3`): sentence-case captions under numbers; 11 px for orb captions and specialty times.
- **Clock** (JetBrains Mono 500, 15 px, tabular): header stopwatch and "Ahora mismo" timers.

### Named Rules
**The Ticking-Only Mono Rule.** JetBrains Mono (`.mono`) is only for clocks that tick (header stopwatch, "Ahora mismo" timers). Durations and totals ("0h 00m", "4 / 4") use Inter with tabular figures (`.num`).

**The Label-Under-Number Rule.** Numbers lead; a small sentence-case label sits beside or beneath them. No eyebrows, no kickers, no uppercase tracked labels.

## Layout

Content max width 1440 px, padding 28 px (16 px at ≤640 px), vertical stack gap 20 px. Header is 56 px, sticky. The dashboard is a two-column console (`1fr` stage + 340 px slab, 24 px gap) above a four-column metric strip separated by vertical 1 px hairlines; at ≤1100 px the slab drops below the stage and metrics go 2-up, at ≤640 px 1-up. Settings uses a 240 px label column + body rows divided by top hairlines (single column ≤720 px).

The flow stage is 460 px tall: member nodes (200×62) at the left, orb (radius 118) at ~39 % of the width, a fan of seven specialty nodes beyond it. Below 700 px of container width the stage switches to a compact list mode (orb on top, member rows, specialty rows, hairline-separated) showing the same data. A visually hidden table carries the stage data for assistive tech.

## Elevation & Depth

Flat, tonal and hairline-built. Depth comes from the near-black ground, raised graphite fills, and low-opacity borders, plus faint radial glows behind the stage and orb (`--stage-glow`, `--orb-core`). There is exactly one lifted, blurred surface.

### Shadow Vocabulary
- **Glass slab** (`backdrop-filter: blur(18px) saturate(1.2); box-shadow: inset 0 1px 0 var(--slab-edge), 0 24px 60px -20px rgba(0,0,0,0.5)`): the "Tu semana" panel only.
- **Live halo** (`box-shadow: 0 0 0 3px <color> 30%`): live dots, beating to 6 px; the stopwatch dot uses `--live-soft`.
- **Identity ring** (`box-shadow: 0 0 0 1.5–2px var(--bg), 0 0 0 3–3.5px <member>`): avatars and the selected color swatch.
- **Strand glow** (SVG `feGaussianBlur` 3, 50 % opacity): under data strands only.

### Named Rules
**The Single Glass Rule.** The "Tu semana" slab is the only glass surface. The header is opaque `--bg` with a 1 px `--line` bottom hairline; nodes, buttons and inputs are solid.

**The No-Glow-On-Chrome Rule.** Glow belongs to data (strands, orb, live dots). Buttons, nav and panels never glow.

## Shapes

Gently rounded rectangles: 8 px for buttons, inputs, nodes, alerts; 12 px for large buttons and swatch cells; 18 px for the slab; full pills for the stopwatch; circles for dots, avatars and the orb. Borders are always 1 px. Strands are cubic Béziers with round caps, 1 px (1.4 px highlighted). Dashed strokes are reserved for structure that is explicitly "not there yet": the orb's inner and outer dotted rings and the dashed border of a pending (not yet joined) member node or pip. The triangle logo is three 2.2 px strokes in Verde, Azul and Orquídea.

### Named Rules
**The Honest Empty Rule.** An empty data channel is drawn as a solid 1 px `--line-2` structure hairline, never as data and never in a member color. Each real session gets its own strand in the member's color.

## Components

### Buttons
Solid, compact and quiet; they press, never bounce.
- **Shape:** 8 px radius, 36 px tall (44 px / 12 px radius for `.btn-lg`), 1 px border.
- **Default:** raised graphite, `--line-2` border, 500/13 px.
- **Primary:** ink fill with ground-colored text, 600. **Go:** Go Green, only for starting the stopwatch. **Quiet:** transparent, `--ink-2`, icon buttons 36×36.
- **Hover / Active:** hover (fine pointers only) raises border to `--line-3` or mixes fill 88 %; active scales to 0.97 over 140 ms `--ease-out`. Disabled: transparent, `--ink-3`.

### Inputs / Fields
- **Style:** sunken black well, 1 px `--line-2`, 8 px radius, 40 px, 14 px text; placeholder `--ink-3`.
- **Focus:** border becomes Live Teal plus a 3 px `--live-soft` ring.
- **Help / error:** 12 px `--ink-3` help text; alerts are coral-tinted boxes with an inline SVG icon.

### Navigation
Text links at 13 px in `--ink-3`; hover and current page go to `--ink`, with the current page marked by a 1 px ink underline sitting on the header hairline. Brand (logo + "trinity-panel" 600/14 px) left; stopwatch pill, theme toggle and avatar right. At ≤720 px the brand name and "Iniciar" label hide.

### Stopwatch Pill (signature)
Raised graphite pill, 40 px, `--line-2` border: status dot (`--ink-4` idle, Live Teal with a breathing halo when running), mono clock, "desde 17:02" in `--ink-3` (hidden ≤960 px), and a 32 px button. Idle the button is Go Green "Iniciar"; running it becomes a neutral ground-colored "Parar" with a `--line-3` border (Go Green is only for starting). Both faces share one grid cell and crossfade with a 3 px blur + scale 0.9 → 1, so the button never changes width. Running, the pill border tints toward Live Teal and a 1 px hairline along its bottom edge fills (linear, 1 s steps) toward the auto-cut; in the last 15 minutes dot, clock, border and hairline turn `--warn`. The clock ticks aligned to the session's own start millisecond and pauses with the tab hidden. Start/stop are optimistic: the UI changes on click; the server confirms behind.

### Pending chip
When an own stopped session has no phrase yet: a 32 px pill left of the stopwatch with a `--warn` dot, 8 % `--warn` fill and "Describe tu sesión". Icon-only ≤960 px.

### Session dialog ("¿Qué has hecho?" / "Añadir horas a mano")
Native modal `<dialog>`, 560 px, solid `--bg-raised` (not glass), 18 px radius, 1 px `--line-2`, backdrop black 60 % without blur. Enters 220 ms (opacity + translateY 8 px + scale 0.98, `--ease-out`), exits 150 ms. Head: italic 300 22 px title, "Hoy 17:02 → 18:25" in `--ink-2`, duration 30 px tabular on the right. Under it a **day ribbon**: a 10 px sunken 0–24 h track with 6/12/18 h hairlines, the session in the member color with a soft glow, the member's other sessions that day in `--line-3`, and a clashing one in `--bad`. Fields: phrase (46 px, 15 px), specialty chips (30 px pills, specialty-colored dot; pressed = 65 % specialty border + 12 % fill), optional auto-growing description, project line. Footer: quiet "Descartar" (two-step inline confirm, coral), `Ctrl ↵` keycaps, "Más tarde", primary "Guardar". Validation shows only after the first save attempt. Auto-cut sessions show a `--warn` note.

### Specialty palette (validated 2026-10-24)
Stored in `specialties.color`, same hex in both themes, fixed order = `sort`: Mantenimiento #4A7AB1, Vídeo #A03B22, Formación #959609, Contenido #AF1A7C, Página web #C47212, Pruebas #07908E, Reuniones #D76034. Passes the dataviz validator on #030405 and #F5F6F5 for adjacent pairs (CVD ΔE 12.3, normal 22.3). It cannot pass all-pairs (7 hues without the members' green/blue/purple), so a specialty color never stands alone: every use carries its name and number (legend rows, tooltips, chips). Formación is under 3:1 on the light surface → always labeled.

### Analysis section (charts)
Lazy-loaded below the console (IntersectionObserver, 400 px margin). Header: italic 300 24 px "Análisis" + period title; right, a pill segmented control (Semana · Mes · Año · Todo) with an ink indicator sliding 260 ms `--ease-out`, arrow keys move it. Charts sit in a hairline grid (2fr | 1fr, 44 px gap), never in cards: each block is a 13 px/600 heading over the chart, separated by `--line` top borders.
- **Stacked bars** (hours per day / week / month): members stacked in fixed order, 2 px surface gap between segments, only the top segment has 4 px rounded corners, bars ≤34 px. Grid `--line`, baseline `--line-3`, axis labels 11 px `--ink-3`. Week buckets add a dashed `--ink-2` team-minimum line. Legend above with each member's period total. Hover: column wash `--line`, other columns to 45 %, tooltip with per-member rows + total. Bars reveal with a 560 ms bottom-up clip-path on period change.
- **Ranking**: two tabs (Horas / % del mínimo) on a sunken track with a sliding raised indicator; 4 px member bars; % tab caps at 150 % with a goal tick; rows reorder with FLIP. "Cumple · +X extra" / "Le faltan X" under each; note with the (proportional) minimum.
- **Heatmap** (weekday × hour): 3 px gaps, 3 px radius; sequential single hue = `--ink` for the team or the member's color when filtered, alpha 14→100 % on a square-root scale; empty cells `--line`. Member filter chips; "Pico" caption.
- **Specialty donut**: 184 px ring (r 64–88), 2 px `--bg` stroke gaps, fixed order; hover dims others to 30 % and the center shows that slice; legend list sorted by time with % and per-member split on hover.
- **Day timeline**: rows per member on sunken 22 px tracks with 3 h hairlines; blocks in member color (manual = 135° hatch), live block glows with a blinking ink edge; a Live Teal "now" line on today; day stepper within the week.
- **Year calendar**: 53 weeks × 7, 12 px cells, fixed levels (0 · <30 min · <1 h · <2 h · ≥2 h), today ringed in Live Teal, future days outlined; days worked, current and best streak.
Every chart has a hover tooltip (solid `--bg-raised` card, rows with member dots, tabular values) and a visually hidden data table.

### Session log ("Sesiones", Phase 5)
Same page shell as Settings (1200 px). A hairline-bounded filter block, never a card: top row = search well (36 px, leading icon, `/` keycap that swaps to a clear button) and, right, date preset chips + two compact date inputs (transparent until a custom range is active). Below, label-column rows (104 px label in `--ink-3` + pill chips) for Persona, Especialidad and Proyecto (hidden with a single project). Chips: transparent, `--ink-3`; pressed = raised fill + `--line-2` border + 3 px halo around the color dot. Then a metric strip (hours · sessions · average, divided by vertical hairlines, Inter tabular 24 px) with a 6 px member split bar + legend and a quiet "Quitar filtros N" button. Results are a table grouped by Madrid day: one `<tbody>` per day whose header row sticks under the app header (`top: var(--header-h)`, solid `--bg`), with that day's filter-wide count and total. Person names and specialty tags in rows are buttons that toggle the filter (pressed = 14 % member/specialty tint). Search hits are `<mark>` in a 26 % `--warn` tint. Filtering never animates the list (frequent action); if the response takes > 160 ms the table dims to 55 % instead of showing a skeleton.

### Pact page ("Pacto", Phase 6)
Same 1200 px shell. Sections are separated by a 15 px/600 heading over a `--line-2` hairline with a 12 px `--ink-3` explanation beside it; never cards. **Week status is shape first, tone second** (16 px SVG glyphs, readable without color): Cumplida = solid ink disc; Recuperada = ring + inner dot; Justificada = `--ink-3` ring with a slash; Recuperando = dashed `--warn` ring; Toque = solid `--warn` diamond; Penalización = `--bad` diamond with a cut cross; En curso = dashed `--ink-2` ring filled as a pie by progress.
- **Esta semana**: one hairline row per member (you first): name + role, a 6 px track to the goal (goal tick at 2/3 width, member-color fill, 45 % member tint beyond the goal for extra, the make-up portion of the goal hatched in 55 % `--warn`), the "why" of the goal in words ("mínimo 4 h − 1 día justificado + 1 h que recupera = 4 h 26 min"), status glyph + verdict, and a hairline-divided stat strip (racha, mejor, desde el inicio, toques).
- **Semana a semana** (signature): a ledger table, members as sticky row heads, ISO weeks as columns (S43 + date), 30 px glyph cells, current week column washed in `--line`; weeks before a member counted are a short `--line-2` dash (honest empty). Hover/focus shows a solid `--bg-raised` tooltip with the exact sentence. Scrolls horizontally, pinned to the current week.
- **Por validar / Ausencias**: hairline lists; inline expanding forms (200 ms open), label-column rows (104 px) with pill chips like the session log; a `--warn` hint states why the action is not allowed before the server would refuse it.
- **Header badge**: admins see a 16 px `--warn` count on "Pacto" when other members' sessions wait for validation.

### Toasts
Bottom-right stack (max 3), solid `--bg-raised` 8 px cards with a 14 px icon (ink check / coral alert), enter from 14 px below in 260 ms, exit 160 ms, reflow with FLIP. Pause on hover and with the tab hidden.

### Flow Stage (signature)
Member nodes (raised graphite, 8 px, name 600 + role in `--ink-3`, hours 17 px tabular "/ 4 h") feed strands into the Orb; specialty labels sit at fan ends with a bordered 11 px time chip. Hovering or focusing a member highlights their strands (opacity 1, 1.4 px) and dims everything else to 0.12; their node border takes the member color. A running session animates an ink dash pulse along its strand.

### Orb (signature)
210 particles on a golden-angle spiral, tinted proportionally by member hours (neutral `--ink-3` when empty), inside a 72-tick ring and a dotted inner ring. Rotates slowly; when anyone is live the outer ring turns Live Teal at 50 % and rotation speeds up. Reduced motion stops it.

### Glass Slab
"Tu semana": own total, 4 px progress track with a goal tick, the pact line and the rivalry line, then hairline-divided blocks ("Ahora mismo", "Clasificación" with 2 px member bars and goal ticks).

## Do's and Don'ts

### Do:
- **Do** draw structure with 1 px hairlines (`--line`, `--line-2`, `--line-3`) on the near-black ground.
- **Do** route every member color through `memberColor()` / `--m-<HEX>`.
- **Do** use `.num` (Inter tabular) for durations and counts, `.mono` only for ticking clocks.
- **Do** put a small sentence-case label under or beside every number.
- **Do** switch any strand visualization to a list with the same data below 700 px of container width.
- **Do** keep empty states honest: zero is shown as zero, empty channels as solid `--line-2` hairlines.

### Don't:
- **Don't** add a second glass surface or make the header translucent.
- **Don't** use member colors, Live Teal or Go Green on chrome, text or decoration.
- **Don't** set durations in JetBrains Mono.
- **Don't** use eyebrows, kickers or uppercase tracked labels.
- **Don't** build KPI card grids; metrics sit in a hairline-divided strip.
- **Don't** glow chrome; glow is for data and live state.
- **Don't** use `--ink-4` for readable text, including placeholders.
