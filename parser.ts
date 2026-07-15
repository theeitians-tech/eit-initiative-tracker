import { AbilityScores, ParsedStatblock } from "./types";

const ABILITY_HEADER_RE =
	/\|\s*STR\s*\|\s*DEX\s*\|\s*CON\s*\|\s*INT\s*\|\s*WIS\s*\|\s*CHA\s*\|/i;
const ABILITY_CELL_RE = /(-?\d+)\s*\(([+-]\d+)\)/g;

const AC_RE = /\*\*Armor Class\*\*\s*(\d+)/i;
const HP_RE = /\*\*Hit Points\*\*\s*(\d+)/i;
const CURRENT_HP_RE = /\*\*Current HP\*\*\s*(\d+)/i;
const INITIATIVE_RE = /\*\*Initiative\*\*\s*([+-]?\d+)/i;
const NAME_RE = /^#\s+(.+)$/m;
const LEGENDARY_RESISTANCE_RE = /Legendary Resistance[^)\n]*\((\d+)\s*\/\s*Day/i;
const LEGENDARY_ACTIONS_RE = /can take\s+(\d+)\s+legendary actions/i;

/**
 * Parses a note's raw markdown body against the shared Creature
 * Statblock / Player Sheet layout. Missing fields come back null (or 0
 * for legendary counts) rather than throwing, since not every note will
 * have every field (e.g. most creatures have no legendary traits).
 */
export function parseStatblock(content: string, sourcePath: string): ParsedStatblock {
	const nameMatch = content.match(NAME_RE);
	const name = nameMatch ? nameMatch[1].trim() : sourcePath;

	const acMatch = content.match(AC_RE);
	const ac = acMatch ? parseInt(acMatch[1], 10) : null;

	const hpMatch = content.match(HP_RE);
	const maxHp = hpMatch ? parseInt(hpMatch[1], 10) : null;

	const currentHpMatch = content.match(CURRENT_HP_RE);
	const currentHp = currentHpMatch ? parseInt(currentHpMatch[1], 10) : null;

	const abilityScores = parseAbilityScores(content);

	const initMatch = content.match(INITIATIVE_RE);
	let initiativeBonus: number | null = initMatch ? parseInt(initMatch[1], 10) : null;
	if (initiativeBonus === null && abilityScores) {
		initiativeBonus = abilityScores.dex;
	}

	const lrMatch = content.match(LEGENDARY_RESISTANCE_RE);
	const legendaryResistanceMax = lrMatch ? parseInt(lrMatch[1], 10) : 0;

	const laMatch = content.match(LEGENDARY_ACTIONS_RE);
	const legendaryActionsMax = laMatch ? parseInt(laMatch[1], 10) : 0;

	return {
		name,
		ac,
		maxHp,
		currentHp,
		initiativeBonus,
		abilityScores,
		legendaryResistanceMax,
		legendaryActionsMax,
		sourcePath,
	};
}

function parseAbilityScores(content: string): AbilityScores | null {
	const headerMatch = ABILITY_HEADER_RE.exec(content);
	if (!headerMatch) return null;

	// Look at everything after the header line for the next table row that
	// actually contains ability score cells like "10 (+0)". This skips the
	// "| ------- | ... |" separator row automatically since it has no matches.
	const rest = content.slice(headerMatch.index + headerMatch[0].length);
	const lines = rest.split("\n");

	for (const line of lines) {
		ABILITY_CELL_RE.lastIndex = 0;
		const cells: number[] = [];
		let m: RegExpExecArray | null;
		while ((m = ABILITY_CELL_RE.exec(line)) !== null) {
			cells.push(parseInt(m[2], 10)); // modifier, not the raw score
		}
		if (cells.length === 6) {
			const [str, dex, con, int, wis, cha] = cells;
			return { str, dex, con, int, wis, cha };
		}
	}

	return null;
}
