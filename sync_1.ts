import { App, TFile } from "obsidian";

const CURRENT_HP_LINE_RE = /(\*\*Current HP\*\*\s*)\d+/i;
const HIT_POINTS_LINE_RE = /(\*\*Hit Points\*\*\s*\d+)/i;

/**
 * Writes a player's live HP back to their sheet's **Current HP** line,
 * reading the full file fresh and writing the full file back (no partial
 * patching) to avoid clobbering any other edits made to the note.
 *
 * If the sheet has no **Current HP** line yet, one is inserted right after
 * **Hit Points** so older sheets get upgraded automatically the first time
 * they're synced.
 */
export async function syncPlayerCurrentHp(
	app: App,
	sourcePath: string,
	newCurrentHp: number
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) {
		throw new Error(`could not find file at ${sourcePath}`);
	}

	const content = await app.vault.read(file);

	let updated: string;
	if (CURRENT_HP_LINE_RE.test(content)) {
		updated = content.replace(CURRENT_HP_LINE_RE, `$1${newCurrentHp}`);
	} else if (HIT_POINTS_LINE_RE.test(content)) {
		updated = content.replace(HIT_POINTS_LINE_RE, `$1\n**Current HP** ${newCurrentHp}`);
	} else {
		throw new Error(`no **Hit Points** line found in ${sourcePath}`);
	}

	if (updated !== content) {
		await app.vault.modify(file, updated);
	}
}
