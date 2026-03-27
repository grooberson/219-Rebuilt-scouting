# REBUILT Scout — Claude Code Context

## What This Application Is

**REBUILT Scout** is a real-time FRC (FIRST Robotics Competition) scouting and alliance selection web app built for **Team 219 IMPACT** for the 2026 REBUILT game season. It is a production tool used during actual FRC competitions to collect match observations, aggregate team statistics, and support alliance selection decisions.

The app combines three data sources:
1. **Manual scouting entries** — human observers fill out a form during each match
2. **Official FRC/TBA API data** — rankings, match schedules, and official scores
3. **Statbotics EPA** — predictive efficiency metrics for teams

## Target Users

- **Scouts**: Team 219 students/mentors watching matches and entering observations on phones or tablets
- **Strategy Lead**: Person making alliance selection decisions, viewing rankings and alliance picker
- **Drive Team Support**: People monitoring the schedule and tracking upcoming matches

All users authenticate with a team password. A view-only mode exists for read-only access, and a test/offline mode exists for development.

## Events Covered

- **NJWAS** — Washington, NJ (Week 1 event, default)
- **NJFLA** — Mount Olive, NJ (Week 2 event)

Both events are FMA (FIRST Mid-Atlantic) District events in New Jersey.

---

## FRC 2026 REBUILT Game

Understanding the REBUILT game is critical for any feature work. The scoring mechanics drive all data collection, statistics, and alliance optimization.

### Game Summary

Two alliances of 3 robots compete on a field with fuel-scoring and tower-climbing mechanics. Matches have a 15-second **Autonomous** period and a 2:15 **Teleop** period.

### Scoring Mechanics

#### Fuel (Coral/Balls scored into Hubs)
- Robots collect fuel and score it into one of two Hub zones
- The **active Hub shifts approximately every 20 seconds** during teleop — scoring in the inactive hub is penalized or wasted
- "Hub-aware" robots track the shift and switch accordingly; tracking this is a key scouting data point

#### Tower Climbing (End of Teleop)
- Robots attempt to climb a tower at the end of the match
- **4 levels**: None (0 pts), L1 (+10 pts), L2 (+20 pts), L3 (+30 pts)
- Tower points in **Autonomous**: None (0 pts) or L1 (+15 pts) — worth more in auto
- Climb speed, failed attempts, and assisting other robots are tracked qualitatively

#### Ranking Points (RP) Bonuses
Alliances earn bonus Ranking Points for reaching thresholds:
1. **Energized RP** — Alliance scores 100+ fuel total
2. **Supercharged RP** — Alliance scores 360+ fuel total
3. **Traversal RP** — Alliance earns 50+ combined tower points

The alliance picker shows real-time RP probability based on selected teams' averages.

### Key Scouting Signals
- **Hub awareness** — does the robot shift with the active hub?
- **Scored inactive hub** — did the robot waste fuel in the wrong hub?
- **Climb reliability** — does the robot consistently reach its advertised climb level?
- **Fuel volume** — high-scoring fuel robots are the backbone of Energized/Supercharged RPs
- **Defense** — did the robot play defense? were they pinned? did they get a card?

---

## Application Architecture

### File Map

| File | Role |
|------|------|
| `index.html` | Full HTML structure (~594 lines), all views inline |
| `app.js` | Main app state, aggregation logic, all view renderers, navigation |
| `form.js` | Scout form state, field setters, submission, team autocomplete |
| `api.js` | FRC API, TBA API, schedule fetch, score normalization |
| `firebase-setup.js` | Firestore real-time listeners, offline persistence, alliance sync |
| `statbotics.js` | Statbotics EPA integration, rankings, RP probability rendering |
| `style.css` | Dark futuristic theme (Exo 2 / Rajdhani / Share Tech Mono fonts) |
| `tests/` | Vitest unit tests |

### Data Flow

1. Scout submits a form entry → saved to **Firestore** `scout_entries` collection
2. Firestore `onSnapshot` listener fires → `_entriesCache` updated in memory
3. `aggregateTeams()` recomputes all team stats from the full cache
4. Views re-render with updated data (teams table, alliance picker cards, etc.)
5. Statbotics and FRC rankings fetched separately and merged into team objects

### Entry Data Model (key fields)

```
teamNum, matchNum, alliance (Red/Blue), scout, event
autoFuel, autoTower (0=none, 1=L1), autoMoved, autoStrategy
teleopFuel, fuelMissed, teleopTower (0-3), hubAware, scoredInactive
srcDepot, srcOutpost, srcNeutral (fuel sources)
climbFast, climbFailed, climbAssisted
playedDefense, wasPinned, pinnedOpponent, gotCard
driving, defense, reliability (1-5 ratings)
strFuelVolume, strClimber, strConsistentAuto, strDefense, strHubAware, strIntake (strengths)
wkScoredWrong, wkBroke, wkSlowIntake, wkNoClimb, wkLooseFuel (weaknesses)
score (calculated), notes (free text)
```

### State Management

- **No framework** — vanilla JavaScript with direct DOM manipulation
- Global `state` object in `app.js` holds all runtime data
- Form state lives in `form.js` as a separate `formState` object
- Entries stored in Firestore, cached in `_entriesCache` array
- Alliance selection state synced via Firestore `alliance_state/{eventCode}` document

### Key Constants and Scoring Math

```javascript
// Tower points
AUTO_TOWER_PTS  = [0, 15]          // index = autoTower value (0 or 1)
TELEOP_TOWER_PTS = [0, 10, 20, 30] // index = teleopTower value (0-3)

// RP thresholds
ENERGIZED_THRESHOLD    = 100  // fuel per alliance
SUPERCHARGED_THRESHOLD = 360  // fuel per alliance
TRAVERSAL_THRESHOLD    = 50   // tower points per alliance
```

---

## APIs and Integrations

### FRC API (`https://frc-api.firstinspires.org/v3.0`)
- Official rankings, practice schedule, practice match scores
- Auth: Basic auth (credentials XOR-obfuscated in `api.js`)

### The Blue Alliance (`https://www.thebluealliance.com/api/v3`)
- Qual and playoff match schedule, detailed score breakdowns
- Event key format: `2026{eventCode.toLowerCase()}` (e.g., `2026njwas`)
- TBA scores are normalized in `normalizeTBABreakdown()` in `api.js`

### Statbotics (`https://api.statbotics.io/v3`)
- Team EPA (Efficiency Points Added) metrics and percentiles
- No auth required; loaded in parallel for all event teams
- Endpoint: `/team_year/{teamNum}/2026`

### Firebase Firestore
- Project: `rebuilt-scouting-db`
- Collections: `scout_entries`, `alliance_state`
- Anonymous auth; Firestore rules require auth for writes
- Offline persistence enabled — entries sync on reconnect

---

## Important Constraints and Conventions

### Do Not Change
- **Authentication flow** — password hash and session handling are intentional
- **Scoring math** — tower point values and RP thresholds match the 2026 game manual
- **Event codes** — NJWAS and NJFLA are hardcoded in `api.js` with full team rosters
- **Firestore schema** — adding new fields to entries is fine; renaming existing fields breaks existing data

### Code Style
- Vanilla JS, no build step (except Vitest for tests)
- CSS custom properties for theming (see `--accent`, `--accent2`, `--accent3`, `--bg`, `--surface`)
- Views are rendered by functions like `renderTeamsTable()`, `renderSchedule()`, `renderAlliancePicker()` in `app.js`
- Toast notifications via `showToast(message, type)` — use for all user feedback

### Mobile Considerations
- The scout form is the primary mobile experience (used courtside)
- Team rankings and alliance picker are primarily desktop tools
- Never make the scout form require more taps — streamline, don't add friction

### Feature Addition Guidelines
- New scouting data points → add to `formState` in `form.js`, `Entry` object structure, and `aggregateTeams()` in `app.js`
- New ranking/sorting columns → add to team table in `renderTeamsTable()` and the sort logic
- New API data → add fetch in `api.js` and merge result into the relevant team objects
- New RP or game mechanic → update the scoring constants and alliance picker RP probability UI
