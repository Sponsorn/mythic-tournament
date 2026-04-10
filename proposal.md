# Midnight Mythic+ Guild Tournament - System Specification

## Overview

A 4-hour live-server guild tournament where randomly drafted teams compete by pushing Mythic+ keys. Teams run whatever keys RNG gives them and accumulate points based on a unified scoring table. A continuous PPR-based handicap narrows the gap between strong and weak teams without overcorrecting.

---

## 1. Draft System

### Format
Spin-the-wheel random assignment, role-locked in 4 pools.

### Draft Order
1. **Pool 1 - Tanks (6 players):** Each tank is spun onto a team. One tank per team.
2. **Pool 2 - Healers (6 players):** Same process. One healer per team.
3. **Pool 3 - Lust DPS (6 players):** One Mage, Evoker, Hunter, or Shaman DPS per team.
4. **Pool 4 - Remaining DPS (12 players):** Spun in pairs, 2 per team.

### Team Composition
- 6 teams of 5 (1 Tank, 1 Healer, 1 Lust DPS, 2 Standard DPS)
- 30 players total required

### Role Declaration
Players declare a single role at sign-up. If a player can flex (e.g., tank or DPS), they choose one pool. Their PPR is calculated based on their declared role's raider.io score.

---

## 2. Player Power Rating (PPR)

PPR is a composite score used for team handicap calculation. It uses raider.io **role-specific** scores, not the combined "all roles" score.

### Formula

```
PPR = RoleWeight * (
    (MidnightS1_RoleScore * 0.70) +
    (TWW_BestSeason_RoleScore * 0.20) +
    (PreviousExpansion_Best_RoleScore * 0.10)
)
```

### Role Weights

| Role         | Weight | Rationale                                      |
|--------------|--------|-------------------------------------------------|
| Tank         | 1.25   | Highest impact on group success, hardest to replace |
| Healer       | 1.15   | Second highest impact, controls group survivability |
| Lust DPS     | 1.05   | Brings essential group utility (Bloodlust/Heroism)  |
| Standard DPS | 1.00   | Baseline                                            |

### Example

A tank with Midnight S1 score 2400, TWW best 2800, previous expansion 2200:
```
PPR = 1.25 * ((2400 * 0.70) + (2800 * 0.20) + (2200 * 0.10))
    = 1.25 * (1680 + 560 + 220)
    = 1.25 * 2460
    = 3075
```

### Team PPR
Sum of all 5 players' individual PPRs.

---

## 3. Scoring System

### Unified Scoring Table

Every team uses the same table. No brackets.

**Formula:** `points = max(0, (key_level - 13) * 2 + (upgrades - 1))`

Depleted runs (upgrades = 0) always score **0 points**.

| Level | Depleted | +1 Upgrade | +2 Upgrades | +3 Upgrades |
|------:|---------:|-----------:|------------:|------------:|
|   +10 |        0 |          0 |           0 |           0 |
|   +11 |        0 |          0 |           0 |           0 |
|   +12 |        0 |          0 |           0 |           0 |
|   +13 |        0 |          0 |           1 |           2 |
|   +14 |        0 |          2 |           3 |           4 |
|   +15 |        0 |          4 |           5 |           6 |
|   +16 |        0 |          6 |           7 |           8 |
|   +17 |        0 |          8 |           9 |          10 |
|   +18 |        0 |         10 |          11 |          12 |
|   +19 |        0 |         12 |          13 |          14 |
|   +20 |        0 |         14 |          15 |          16 |
|   +21 |        0 |         16 |          17 |          18 |
|   +22 |        0 |         18 |          19 |          20 |
|   +23 |        0 |         20 |          21 |          22 |
|   +24 |        0 |         22 |          23 |          24 |
|   +25 |        0 |         24 |          25 |          26 |

### Scoring Rules

- **Every timed run scores at full value.** No diminishing returns for repeated dungeons. Teams can't choose their keys (RNG), so penalizing duplicates would punish bad luck.
- **Depleted runs score 0.** The key still drops, but no tournament points are earned.
- **All runs within the 4-hour window count.** No cap on number of runs.

### Death Handling

Deaths are **not** a direct scoring penalty. The M+ timer already penalizes deaths (+15 seconds per death at +12 and above), which affects upgrade count and whether the key is timed at all. Deaths serve as a **tiebreaker only** (see section 5).

---

## 4. Handicap System

### Purpose

The draft is random (spin-the-wheel), so team strength varies. The handicap multiplier narrows the gap between strong and weak teams without overcorrecting. The best-performing team should still be able to win.

### Formula

```
league_avg_ppr = sum(all team PPRs) / number_of_teams
team_handicap  = 1 + ((league_avg_ppr - team_ppr) / league_avg_ppr) * HANDICAP_STRENGTH
adjusted_score = raw_tournament_score * team_handicap
```

### Handicap Strength

**Recommended: `HANDICAP_STRENGTH = 0.20`**

This produces approximately:
- A team 20% above average PPR gets multiplier ~0.96 (4% penalty)
- A team 20% below average PPR gets multiplier ~1.04 (4% boost)
- Maximum swing between strongest and weakest team: ~11%

### Why 0.20?

Backtested against the previous tournament (TWW Season 1):
- At 0.0 (no handicap): pure meritocracy, strongest team always wins
- At 0.2: tightens the field without reordering teams that outperformed
- At 0.3+: starts reordering mid-pack teams based on PPR rather than play
- At 0.5: approaches overcorrection (the old bracket system's problem)

### Transparency

Handicap multipliers are published before the tournament starts, immediately after the draft. Every team knows their multiplier going in.

---

## 5. Tiebreakers

When two or more teams have the same adjusted score, resolve in order:

1. **Fewer total deaths** across all runs (cleaner execution wins)
2. **Higher single best run score** (peak performance)
3. **Fewer depleted keys** (consistency)
4. **Coin flip** (if all else is equal)

---

## 6. Tournament Format

### Timeline

| Phase          | Duration | Activity                                       |
|----------------|----------|-------------------------------------------------|
| Pre-tournament | ~1 week  | Sign-ups, PPR calculation, spin-the-wheel draft |
| Event day      | 30 min   | Setup, team coordination, WCL live logging      |
| Tournament     | 4 hours  | Teams run keys, live scoreboard updates          |
| Post-event     | 30 min   | Final verification, results announcement         |

### Rules

- All team members must be in the same M+ group for runs to count.
- Teams must live-log to Warcraft Logs. The WCL report URL is submitted before the event.
- Only runs completed within the 4-hour window count.
- If a player disconnects mid-key, the run still counts (or doesn't) based on completion.
- No external help (non-team members joining the key).

### Midnight S1 Dungeon Pool

| Dungeon               | Short | Type   |
|------------------------|-------|--------|
| Windrunner Spire       | WS    | New    |
| Maisara Caverns        | MC    | New    |
| Nexus-Point Xenas      | NPX   | New    |
| Magister's Terrace     | MT    | New    |
| Algeth'ar Academy      | AA    | Legacy |
| Seat of the Triumvirate| SotT  | Legacy |
| Skyreach               | SKY   | Legacy |
| Pit of Saron           | PoS   | Legacy |

*(Verify exact pool at tournament time -- some sources list slight variations.)*

---

## 7. Data Pipeline

### Source
Warcraft Logs API, polled from Node.js backend on Raspberry Pi 5.

### Per-Run Data Points

| Field          | Source        | Used For            |
|----------------|---------------|---------------------|
| dungeon        | WCL API       | Display             |
| key_level      | WCL API       | Scoring formula     |
| upgrades       | WCL API       | Scoring formula     |
| in_time        | WCL API       | Timed vs depleted   |
| deaths         | WCL API       | Tiebreaker          |
| duration_ms    | WCL API       | Display / analysis  |
| boss_kills     | WCL API       | Progress tracking   |
| finished_at    | WCL API       | Within event window |

### Scoring Pipeline

```
1. Poll WCL API for each team's report
2. For each completed run:
   a. Check finished_at is within tournament window
   b. If upgrades > 0: score = max(0, (level - 13) * 2 + (upgrades - 1))
   c. If upgrades == 0: score = 0
3. Sum all run scores -> team raw score
4. Apply handicap multiplier -> team adjusted score
5. Rank by adjusted score, tiebreak by deaths
6. Push to WebSocket -> browser source overlays
```

---

## 8. Backtest Results

Simulated against the previous tournament (TWW S1, 10 teams, bracket system):

| Rank | Team                              | Old Pts | Old Rk | New Raw | Adjusted | New Rk |
|-----:|-----------------------------------|--------:|-------:|--------:|---------:|-------:|
|    1 | Power Rangers STD                 |      42 |      2 |      78 |     76.3 |  **1** |
|    2 | FatKidsAreHardToKidnap            |      39 |      3 |      80 |     75.7 |  **2** |
|    3 | Timed? Eventually                 |      43 |      1 |      76 |     73.7 |  **3** |
|    4 | Just Vibing                       |      37 |      4 |      71 |     70.0 |      4 |
|    5 | Duwe's Goonsquad                  |      24 |      7 |      65 |     65.6 |  **5** |
|    6 | ALT F4 on boss pull               |      31 |      5 |      66 |     65.6 |  **6** |
|    7 | The Bear, the Bow & the Bruisers  |      31 |      6 |      58 |     58.1 |  **7** |
|    8 | Goon Platoon                      |      22 |      9 |      47 |     48.6 |  **8** |
|    9 | Meme Team                         |      23 |      8 |      41 |     42.0 |  **9** |
|   10 | Clappy Hands                      |      15 |     10 |      24 |     25.4 |     10 |

**Note:** Rank 5/6 tie (65.6) broken by deaths: ALT F4 (25) beats Duwe's (27).

### What Changed

- **FatKids (+1):** No longer punished by bracket D. Highest raw score in the field.
- **Duwe's Goonsquad (+2):** Same bracket D fix. Raw performance properly reflected.
- **Timed? Eventually (-2):** Was bracket C, which aligned with the average. Drops because other teams were being artificially suppressed.
- **Meme Team (-1):** Was bracket B (boosted). Without the boost, drops below Goon Platoon.

---

## 9. Configuration Reference

```json
{
  "tournament": {
    "duration_hours": 4,
    "team_count": 6,
    "team_size": 5
  },
  "scoring": {
    "formula": "max(0, (key_level - 13) * 2 + (upgrades - 1))",
    "depleted_score": 0,
    "all_runs_count": true,
    "best_per_dungeon_only": false
  },
  "handicap": {
    "strength": 0.20,
    "formula": "1 + ((league_avg_ppr - team_ppr) / league_avg_ppr) * strength"
  },
  "ppr": {
    "weights": {
      "midnight_s1": 0.70,
      "tww_best": 0.20,
      "previous_expansion": 0.10
    },
    "role_multipliers": {
      "tank": 1.25,
      "healer": 1.15,
      "lust_dps": 1.05,
      "standard_dps": 1.00
    }
  },
  "tiebreakers": ["fewer_deaths", "highest_single_run", "fewer_depletes", "coin_flip"],
  "dungeonPool": {
    "WS":   { "name": "Windrunner Spire",        "type": "new" },
    "MC":   { "name": "Maisara Caverns",         "type": "new" },
    "NPX":  { "name": "Nexus-Point Xenas",       "type": "new" },
    "MT":   { "name": "Magister's Terrace",       "type": "new" },
    "AA":   { "name": "Algeth'ar Academy",        "type": "legacy" },
    "SotT": { "name": "Seat of the Triumvirate",  "type": "legacy" },
    "SKY":  { "name": "Skyreach",                 "type": "legacy" },
    "PoS":  { "name": "Pit of Saron",             "type": "legacy" }
  }
}
```

---

## 10. Open Questions

- **Dungeon pool verification:** Some sources list Murder Row / Den of Nalorakk instead of Magister's Terrace as Midnight-native dungeons. Confirm exact pool before tournament.
- **PPR data source:** Need to decide whether to pull raider.io scores via API or have players self-report (with verification).
- **Handicap strength tuning:** 0.20 is the recommendation from backtesting, but could be adjusted after seeing the actual PPR spread of the Midnight tournament field. If the spread is tighter than TWW, a lower strength (0.15) may be better.
- **Starting key level:** Teams need a key to start. Coordinate so each team has at least a +14 key at tournament start, or define a warm-up period for key generation.
- **Multiple WCL reports:** If a WCL report breaks mid-tournament, teams need a backup logging plan (backup logger, second report URL).
