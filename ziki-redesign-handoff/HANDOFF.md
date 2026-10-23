# Ziki UI redesign — handoff for Claude Code

This folder is the design reference for re-skinning the existing Ziki app (ziki.dev). **Keep every existing feature, route, API call and permission rule; change the UI only.**

- `designs/` — one file per screen (light + dark). They are HTML mockups: open them as reference for layout, spacing, copy and states. Markup is inline-styled; the small `class Component` script at the bottom of each file shows the intended interactive states (it is mock logic, not production code).
- `assets/` — logo files cut from the brand sheet (`ziki-logo-dark.png` = white wordmark for dark backgrounds, `ziki-logo-light.png` = navy wordmark, `ziki-mark.png` = icon only). Replace with the original SVG logo if one exists.

## Screens

| Design file | Screen | Notes |
|---|---|---|
| `Main.dc.html` / `Dark.dc.html` | Overview (default) + Issues list | One file holds both views; the sidebar switches them |
| `Issue.dc.html` / `IssueDark.dc.html` | Single issue | Main column + side rail; Conversation / Agent decisions tabs |
| `Leaderboard.dc.html` / `LeaderboardDark.dc.html` | Leaderboard | Top‑3 podium, "your standing", rankings with Points/Solved sort |
| `CreateAgent.dc.html` / `CreateAgentDark.dc.html` | Create agent | Starting level as selectable cards |
| `ManageAgents.dc.html` / `ManageAgentsDark.dc.html` | Your agents (manage) | One card per agent, key strip, preferred areas |
| `ConnectAgent.dc.html` / `ConnectAgentDark.dc.html` | Connect your agent | Stepper, assistant cards, setup block, test connection |
| `ApproveAgent.dc.html` / `ApproveAgentDark.dc.html` | Approve an agent | Code → review → approved/denied |
| `Settings.dc.html` / `SettingsDark.dc.html` | Settings | Left section nav: Account, Preferences, Agents & API, Data & privacy |
| `Webhooks.dc.html` / `WebhooksDark.dc.html` | Webhooks | Subscriptions list, add form, one-time secret reveal |
| `Login.dc.html` / `LoginDark.dc.html` | Sign in | Split layout: brand panel + Google sign-in card |

Map each to the app's existing route; do not invent new routes or endpoints.

## App shell (all signed-in screens)

- **Sidebar** (dark, `#0B1733`, ~248px): logo, collapse button, project switcher, nav (Overview, Issues with count, Team). Active item = blue pill `#2E6FEF` with glow. Agents is **not** in the sidebar.
- **Top bar** (white / surface): points pill, **Escalation** button (red‑tinted), **Agents** dropdown (agents list + Create agent + Manage agents), theme toggle, notifications bell with unread badge, **avatar menu**.
- **Avatar menu**: profile header (name, role, points), Theme switch (System / Light / Dark), Switch workspace, Leaderboard, Settings, Docs & /llms.txt, Sign out (red).
- The old floating "Report issue" button is removed; "New issue" sits beside each page title.
- Stacks to one column at phone width (sidebar on top, cards full width, wide tables scroll horizontally).

## Design tokens

Font: **Manrope** (400–800). Monospace: system `ui-monospace`.

Brand: Deep Ocean `#0B1733`, Blue Slate `#263B63`, Electric Blue `#3978F6`, Sky Tint `#8FC9FF`, Porcelain `#F5F7FC`. Buttons with white text use `#2E6FEF` (Electric Blue darkened for 4.5:1 contrast).

| Token | Light | Dark |
|---|---|---|
| `--bg` page | `#F5F7FC` | `#070F22` |
| `--surface` cards, top bar | `#FFFFFF` | `#0E1A33` |
| `--text` | `#15121F` | `#E8EEF9` |
| `--text2` secondary | `#3E4A63` | `#B7C3DA` |
| `--muted` | `#5F6577` | `#93A0B8` |
| `--border` | `#E3E8F2` | `#22324F` |
| `--divider` | `#EEF1F7` | `#1A2844` |
| `--tint` (table headers, highlights) | `#EAF2FE` | `#15284A` |
| `--rowSel` selected row | `#F3F8FF` | `#13254A` |
| `--chip` | `#F0F2F7` | `#1B2A47` |
| `--seg` segmented control track | `#EEF1F6` | `#0A1530` |
| `--accentText` links | `#1F5FD9` | `#8FC9FF` |
| ok bg / fg | `#E3F6EC` / `#146C43` | `#0F3326` / `#6EE7A8` |
| bad bg / fg / border | `#FDE8E4` / `#A3261A` / `#F4B3A8` | `#3A1517` / `#FCA5A0` / `#6B2A27` |
| warn bg / fg / border | `#FDF3D7` / `#7A4E00` / `#F0CD72` | `#3A2C0C` / `#F6CF6B` / `#6B5216` |
| info bg / fg | `#E7F0FF` / `#1D4FB8` | `#14294F` / `#9CC2FF` |
| security bg / fg | `#FDECEF` / `#B4233F` | `#3A1424` / `#F9A8C0` |

Shape: cards radius **20px**, 1px `--border`, no heavy shadow. Buttons, chips, filters and tabs are **pills** (999px). Inputs 12px radius, 42–48px tall. Table header row is a `--tint` pill with uppercase 12px `--accentText` labels. Touch targets ≥ 40px.

## Status language (use everywhere)

- Priority/Severity: High = bad colours, Medium = warn colours (with border), Low = chip.
- Status: Open / In progress = info. Stage: Confirmed = ok, Reported = chip.
- Comment types (issue page) each get a label, icon and 4px left accent: Comment (grey), Bid (amber), Review (blue), Delivery (green), Merge request (rose).
- Agent decisions: Not a real issue (bad), Confirmed (ok), Claimed (info), Good to merge (ok), Not ready to merge (warn).

## Key behaviours shown in the designs

- **Overview**: 4 stat cards (Points, Created by me, Assigned to me, Resolved issues) with hover lift + top gradient line; "Issues assigned to me" table; "Your points" bar chart with Daily/Weekly/Monthly/Yearly and a date-range picker (presets + From/To). Weekly view draws a dashed 500‑pt line; weeks ≥ 500 are solid blue with a green "+N" chip; users may exceed 500.
- **Issues**: platform tabs with counts, search with `/` shortcut, Filter popover (Show, Kind, Status, Severity, Category, Platform, Sort By).
- **Approve agent**: code input auto-uppercases and inserts the dash (`ABCD-2345`); Continue disabled until valid.
- **Webhooks**: Add disabled until an agent is picked and the URL is a valid `https://` URL; signing secret shown once after creation.
- **Settings**: Save buttons disabled until the value changes; wallet validates `0x` + 40 hex; notification sub-toggles disable when the master toggle is off; Delete account requires typing `DELETE`.
- Respect `prefers-reduced-motion` (hover/entrance animations off).

## Placeholders in the mockups

Bracketed text such as `[Agent name]`, `[User name]`, `[your email]`, `[mm:ss]`, `[signing secret shown here]` and all chart/stat numbers are sample data — bind them to real data. Setup prompts other than the first lines of the Claude prompt, and the non-Claude setup steps, are placeholders: keep the app's current copy.

---

## Prompt to paste into Claude Code

```
Read ziki-redesign-handoff/HANDOFF.md and the mockups in ziki-redesign-handoff/designs/.
Re-skin the existing Ziki app to match them, screen by screen, in both light and dark mode.
Rules:
- Keep all existing features, routes, data fetching, API calls and permissions. UI changes only.
- First add the design tokens (CSS variables for light/dark from HANDOFF.md), the Manrope font and the logo assets, then build the shared app shell (sidebar, top bar, Agents dropdown, avatar menu).
- Then update screens in this order: Overview, Issues list, Single issue, Leaderboard, Agents (create, manage, connect, approve), Settings, Webhooks, Sign in.
- Reuse/extend existing components; don't hard-code the mockups' sample data.
- After each screen, run the app's lint/tests and show me a short summary before moving on.
Start by exploring the codebase and proposing a plan.
```
