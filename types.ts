export type CombatantKind = "creature" | "player";

export interface AbilityScores {
	str: number;
	dex: number;
	con: number;
	int: number;
	wis: number;
	cha: number;
}

// What we're able to pull out of a Creature Statblock or Player Sheet note.
export interface ParsedStatblock {
	name: string;
	ac: number | null;
	maxHp: number | null;
	currentHp: number | null; // only meaningful for players; null = "start at max"
	initiativeBonus: number | null; // explicit **Initiative** line, or derived from DEX
	abilityScores: AbilityScores | null;
	legendaryResistanceMax: number; // 0 if none found
	legendaryActionsMax: number; // 0 if none found
	sourcePath: string;
}

export interface Condition {
	id: string;
	label: string;
}

export interface Combatant {
	id: string;
	kind: CombatantKind;
	name: string;
	sourcePath: string | null;

	// Grouping (creatures only; shared-HP-pool minion tracking)
	isGroup: boolean;
	groupCount: number;
	perUnitMaxHp: number;

	initiative: number | null;
	initiativeBonus: number | null; // retained so "Roll Monsters" can (re)roll
	ac: number | null;

	maxHp: number;
	currentHp: number;

	legendaryResistanceMax: number;
	legendaryResistanceCurrent: number;
	legendaryActionsMax: number;
	legendaryActionsCurrent: number;

	conditions: Condition[];
}

export interface EncounterState {
	combatants: Combatant[];
	round: number;
	activeCombatantId: string | null; // id of whoever's turn it currently is
	active: boolean; // whether turn order has been started
}

export const STANDARD_CONDITIONS: string[] = [
	"Blinded",
	"Charmed",
	"Deafened",
	"Exhaustion 1",
	"Exhaustion 2",
	"Exhaustion 3",
	"Exhaustion 4",
	"Exhaustion 5",
	"Exhaustion 6",
	"Frightened",
	"Grappled",
	"Incapacitated",
	"Invisible",
	"Paralyzed",
	"Petrified",
	"Poisoned",
	"Prone",
	"Restrained",
	"Stunned",
	"Unconscious",
];

export function emptyEncounterState(): EncounterState {
	return { combatants: [], round: 1, activeCombatantId: null, active: false };
}

export function newId(): string {
	return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
