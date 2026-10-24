# Decision log

Every product decision was written down and closed in a planning document **before** any code
was written (23 October 2026). Implementation decisions taken along the way are listed after
them, with the phase where they were made.

## Product decisions (made up front)

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Stack | Supabase (Postgres, auth, realtime) + static site on Cloudflare Pages | Login and realtime come built in, SQL for the charts, less own code = fewer bugs, 0 € |
| D2 | Frontend | SvelteKit | Smallest bundle of the options considered (React, Astro, vanilla) |
| D3 | App type | Installable PWA, desktop only | The team only uses it on a computer |
| D4 | Login | Discord OAuth, closed list of 3 accounts | The team already lives on Discord; no new passwords |
| D5 | Stopwatch | Server-side, no pause, auto-cut at 4 h, manual hours allowed but flagged, hours never editable, one per member | Closing the tab or switching device must not lose time; hours must be trustworthy |
| D6 | Categories | 7 specialties (web, content, video, maintenance, in-game testing, meetings, learning); a session can have several | Mirrors the team's roles |
| D7 | Projects | Project field on each session + filter; the weekly minimum counts all projects | The tool serves every team project, not just one |
| D8 | Charts | Stacked bars, minimum line, day × hour heatmap, day timeline, specialty donut, yearly calendar | Answers "who worked, when, on what" |
| D9 | Ranking | Two tabs: total hours and % of the minimum | Hours reward effort, % is fairer when the minimum changes |
| D10 | Permissions | Everyone sees everything; all three are admins; one owner grants admin; nobody validates their own sessions | Transparency is the point of the team pact |
| D11 | Notifications | Live "who is working", Discord message on start/stop, Sunday summary, Thursday reminder below 50 % | Keeps the pact visible where the team already talks |
| D12 | Visual design | Three generated proposals; chosen: dark console with member strands flowing into a central orb | Each member has a fixed colour across every chart |
| D13 | Hosting | `trinity-panel.pages.dev` | Free, independent from other team projects |
| D14 | v1 scope | v1: profile streaks, personal weekly goal, weekly backup. v2: CSV export, GitHub links, keyboard shortcut, offline mode | Ship the pact first |

## Implementation decisions

| Phase | Decision | Why |
|---|---|---|
| 2 | Closed list enforced by a trigger on `auth.users` | An unknown Discord account cannot even create a user |
| 3 | Hours are written only by SQL functions using the server clock (`start_session`, `stop_session`, `add_manual_session`) | The browser key is public, so the rules have to live in the database |
| 3 | Overlapping sessions are rejected by an exclusion constraint | One person cannot be in two places at once |
| 3 | Stopping before 1 minute deletes the session | Accidental clicks should not pollute the log |
| 4 | Charts hand-drawn in SVG instead of uPlot/Chart.js (changes D8's library choice) | Lighter and follows the design system |
| 4 | Member and specialty colours replaced by a palette checked for colour blindness | The original palette failed the check (teal ≈ grey, red ≈ pink) |
| 5 | Filtering and totals computed in Postgres (`session_log`); filters live in the URL | Totals cover the whole filter, not one page; links can be shared |
| 6 | One SQL function (`pact_status`) computes every week's state: met, made up, justified, warning, penalty | One source of truth for the pact |
| 6 | Each absent day lowers that week's minimum by 1/7 | Proportional, and a full week is simply "justified" |
| 7 | Discord notices sent from Postgres with `pg_cron` + `pg_net` and a unique key per notice | No extra server; a notice is never sent twice |
| 7 | Start notices wait until a session has run for 1 minute | Accidental clicks never reach Discord |
| 7 | Webhook URL stored in a `private` schema the API cannot read; only the owner can change it | Anyone with the URL could post to the channel |
| 7 | Weekly in-database backup, downloadable as JSON by admins | D14; protects against mistakes inside the app |
| 7 | Demo mode runs the real migrations in an in-browser Postgres (PGlite) | Screenshots and local trials without real data; stripped from the production build |
