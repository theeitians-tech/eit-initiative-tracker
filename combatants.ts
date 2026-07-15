import { Combatant, ParsedStatblock, newId } from "./types";

export function buildCreatureCombatant(parsed: ParsedStatblock, quantity: number): Combatant {
	const perUnitMaxHp = parsed.maxHp ?? 1;
	const isGroup = quantity > 1;

	return {
		id: newId(),
		kind: "creature",
		name: isGroup ? `${parsed.name} ×${quantity}` : parsed.name,
		sourcePath: parsed.sourcePath,

		isGroup,
		groupCount: quantity,
		perUnitMaxHp,

		initiative: null,
		initiativeBonus: parsed.initiativeBonus,
		ac: parsed.ac,

		maxHp: perUnitMaxHp * quantity,
		currentHp: perUnitMaxHp * quantity,

		legendaryResistanceMax: parsed.legendaryResistanceMax,
		legendaryResistanceCurrent: parsed.legendaryResistanceMax,
		legendaryActionsMax: parsed.legendaryActionsMax,
		legendaryActionsCurrent: parsed.legendaryActionsMax,

		conditions: [],
	};
}

export function buildPlayerCombatant(parsed: ParsedStatblock): Combatant {
	const maxHp = parsed.maxHp ?? 1;
	const startingHp = parsed.currentHp ?? maxHp;
	return {
		id: newId(),
		kind: "player",
		name: parsed.name,
		sourcePath: parsed.sourcePath,

		isGroup: false,
		groupCount: 1,
		perUnitMaxHp: maxHp,

		initiative: null,
		initiativeBonus: parsed.initiativeBonus,
		ac: parsed.ac,

		maxHp,
		currentHp: startingHp,

		legendaryResistanceMax: 0,
		legendaryResistanceCurrent: 0,
		legendaryActionsMax: 0,
		legendaryActionsCurrent: 0,

		conditions: [],
	};
}

/**
 * Splits a shared-HP-pool group into N individual combatants, each with
 * their own HP tracking. One-way — there's no re-collapsing back into a
 * group, which is an intentional v1 simplification (see README).
 */
export function splitGroup(group: Combatant): Combatant[] {
	const result: Combatant[] = [];
	for (let i = 1; i <= group.groupCount; i++) {
		result.push({
			...group,
			id: newId(),
			name: `${group.name.replace(/\s*×\d+$/, "")} ${i}`,
			isGroup: false,
			groupCount: 1,
			maxHp: group.perUnitMaxHp,
			currentHp: group.perUnitMaxHp,
			conditions: [],
		});
	}
	return result;
}
