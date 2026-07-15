# Eit Initiative Tracker

A vault-native initiative tracker: no separate bestiary database, no manual
re-entry of stats. It reads creatures and players straight out of your
existing notes and tracks a full combat — initiative, HP, AC, conditions,
Legendary Resistance/Actions — in a persistent sidebar panel.

## How it finds combatants

- **Creatures**: any note tagged `#bestiary`
- **Players**: any note tagged `#PC`

Both are parsed with the same logic, reading:
- `**Armor Class**`
- `**Hit Points**`
- `**Initiative**` (optional — falls back to the DEX modifier if omitted)
- The STR/DEX/CON/INT/WIS/CHA ability table
- `**Legendary Resistance (X/Day).**` in Traits, if present
- `*The monster can take X legendary actions...*` in Legendary Actions, if present

## Two format changes needed in your vault

**1. Tag your bestiary notes.** Your existing `#SB` statblocks aren't
automatically picked up — add `#bestiary` alongside `#SB` on any creature
you want available in the encounter picker.

**2. Add Player Sheets.** These didn't exist before now. Use the format in
`Player Sheet Format.md` (included below) — it mirrors your Creature
Statblock style, tagged `#PC`.

**Optional but recommended:** add a `**Initiative**` line to your Creature
Statblock Format (right after Speed) going forward. Not required — anything
without it just falls back to the DEX modifier — but it lets you hand-tune
a creature's initiative bonus separately from raw DEX when you want to.

## Using it

1. Command Palette → **"Open Initiative Tracker"** (or click the sword icon
   in the ribbon). Opens a panel in the right sidebar.
2. **Add Combatants** → check off players, set quantities and add creatures
   from your `#bestiary` notes. Adding a creature with quantity > 1 creates
   one grouped row with a shared HP pool (e.g. "Goblin ×3" tracked as a
   single pool) — click **Split into individuals** later if you want them
   tracked separately.
3. **Roll Monsters** — rolls 1d20 + initiative bonus for every creature (or
   creature group) that doesn't have initiative set yet. One roll per
   group, not per individual, matching the usual DM shortcut.
4. Type in player initiative rolls manually in their row's **Init** field.
5. The list auto-sorts high → low as initiative values come in.
6. **Next Turn** advances through the sorted order, wrapping to a new round
   automatically. Legendary Actions refill automatically when it becomes
   that creature's turn.
7. Track HP via the **HP** field (direct edit) or the **±dmg/heal** quick
   box + Apply. AC is directly editable too, in case of cover or spell
   effects. Conditions attach via the dropdown on each row.
   - **For players specifically**, every HP change also writes straight
     back to their `#PC` sheet's `**Current HP**` line — so the sheet
     always reflects where they actually stand, with nothing to update by
     hand after the fight. If a sheet doesn't have a `**Current HP**` line
     yet, one gets added automatically the first time it syncs. Creatures
     aren't synced back to their notes — only players.
8. Legendary Resistance only decrements when you click **-1 LR** — it
   doesn't auto-reset, since it persists for the whole encounter (reset
   manually after a long rest via **Reset LR**).
9. **Reset Encounter** clears everything and starts fresh (asks for
   confirmation first).

Everything auto-saves after every change — closing Obsidian mid-fight and
reopening later picks up exactly where you left off.

## Known v1 simplifications

- Grouped creatures can be split into individuals, but not merged back into
  a group.
- Turn order is recalculated live from current initiative values, so
  editing an initiative mid-combat can shuffle turn order — this is
  intentional (matches how most tables handle a late Bless/Haste effect on
  initiative) but worth knowing about.
- HP sync only covers **Current HP** for players — AC, initiative, and
  creature stats are never written back to any note.
- No automatic loot/XP/session-log generation yet.

## Building & releasing (nothing runs on your machine)

Same setup as the Smart Linker plugin: `.github/workflows/release.yml`
builds on GitHub's servers whenever you push a version tag.

```bash
git tag 1.0.0
git push origin 1.0.0
```

Check the **Actions** tab to watch it build, then **Releases** to confirm
`main.js` is attached.

## Installing via BRAT

Same as before — if you've already installed BRAT for the Smart Linker,
just add this as a second beta plugin:

1. Command Palette → **"BRAT: Add a beta plugin for testing"**
2. Paste: `https://github.com/YOUR-USERNAME/eit-initiative-tracker`
3. Enable **"Eit Initiative Tracker"** under Settings → Community Plugins.

## Repository structure

```
eit-initiative-tracker/
  main.ts              # plugin entry point (registers view, commands)
  types.ts              # shared type definitions
  parser.ts             # statblock/player-sheet field extraction
  combatants.ts          # builds Combatant objects from parsed notes
  sync.ts                 # writes player HP changes back to their sheet
  vaultIndex.ts          # #bestiary / #PC vault scanning
  state.ts               # persistence + pub/sub store
  pickerModal.ts          # "Add Combatants" modal
  trackerView.ts          # the sidebar panel itself
  styles.css
  manifest.json
  versions.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  .gitignore
  .github/workflows/release.yml
  README.md
  Player Sheet Format.md   # copy this into P:\Eit\
```
