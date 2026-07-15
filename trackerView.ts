import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { EncounterStore } from "./state";
import { Combatant, Condition, STANDARD_CONDITIONS, newId } from "./types";
import { splitGroup } from "./combatants";
import { AddCombatantsModal } from "./pickerModal";
import { syncPlayerCurrentHp } from "./sync";

export const VIEW_TYPE_TRACKER = "eit-initiative-tracker-view";

type HpMode = "damage" | "heal";

export class TrackerView extends ItemView {
	store: EncounterStore;
	unsubscribe: (() => void) | null = null;
	private hpModeByCombatant: Map<string, HpMode> = new Map();

	constructor(leaf: WorkspaceLeaf, store: EncounterStore) {
		super(leaf);
		this.store = store;
	}

	getViewType(): string {
		return VIEW_TYPE_TRACKER;
	}

	getDisplayText(): string {
		return "Initiative Tracker";
	}

	getIcon(): string {
		return "swords";
	}

	async onOpen() {
		this.unsubscribe = this.store.subscribe(() => this.render());
		this.render();
	}

	async onClose() {
		if (this.unsubscribe) this.unsubscribe();
	}

	private getSorted(): Combatant[] {
		const combatants = this.store.state.combatants;
		const withInit = combatants.filter((c) => c.initiative !== null);
		const withoutInit = combatants.filter((c) => c.initiative === null);
		withInit.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
		withoutInit.sort((a, b) => a.name.localeCompare(b.name));
		return [...withoutInit, ...withInit];
	}

	private render() {
		const container = this.contentEl;
		const scrollPos = container.scrollTop;
		container.empty();
		container.addClass("eit-it-view");

		this.renderToolbar(container);

		const sorted = this.getSorted();

		if (sorted.length === 0) {
			container.createEl("p", {
				text: 'No combatants yet. Click "Add Combatants" to pull from your #bestiary and #PC notes.',
				cls: "eit-it-empty",
			});
		} else {
			const list = container.createDiv({ cls: "eit-it-combatant-list" });
			for (const combatant of sorted) {
				this.renderCombatantCard(list, combatant);
			}
		}

		container.scrollTop = scrollPos;
	}

	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "eit-it-toolbar" });

		const addBtn = toolbar.createEl("button", { text: "Add Combatants" });
		addBtn.onclick = () => new AddCombatantsModal(this.app, this.store).open();

		const rollBtn = toolbar.createEl("button", { text: "Roll Initiative" });
		rollBtn.onclick = () => this.rollInitiative();

		const nextBtn = toolbar.createEl("button", { text: "Next Turn" });
		nextBtn.onclick = () => this.nextTurn();

		const endBtn = toolbar.createEl("button", {
			text: "End Encounter",
			cls: "eit-it-danger-btn",
		});
		endBtn.onclick = () => this.endEncounter();

		container.createDiv({
			text: `Round ${this.store.state.round}`,
			cls: "eit-it-round-badge",
		});
	}

	private rollInitiative() {
		let rolledAny = false;
		this.store.update((s) => {
			for (const c of s.combatants) {
				if (c.kind === "creature" && c.initiative === null) {
					const roll = Math.ceil(Math.random() * 20);
					c.initiative = roll + (c.initiativeBonus ?? 0);
					rolledAny = true;
				}
			}
		});
		if (!rolledAny) new Notice("No unrolled creatures to roll.");
	}

	private nextTurn() {
		const sorted = this.getSorted();
		if (sorted.length === 0) {
			new Notice("Add combatants first.");
			return;
		}

		this.store.update((s) => {
			let roundAdvanced = false;

			if (!s.active) {
				s.active = true;
				s.activeCombatantId = sorted[0].id;
			} else {
				const currentIndex = sorted.findIndex((c) => c.id === s.activeCombatantId);
				let nextIndex = currentIndex + 1;
				if (currentIndex === -1) {
					nextIndex = 0;
				} else if (nextIndex >= sorted.length) {
					nextIndex = 0;
					s.round += 1;
					roundAdvanced = true;
				}
				s.activeCombatantId = sorted[nextIndex].id;
			}

			if (roundAdvanced) {
				for (const c of s.combatants) {
					if (c.legendaryActionsMax > 0) {
						c.legendaryActionsCurrent = c.legendaryActionsMax;
					}
				}
			}
		});
	}

	private endEncounter() {
		if (!confirm("End the encounter and clear all combatants? This can't be undone.")) return;
		this.store.update((s) => {
			s.combatants = [];
			s.round = 1;
			s.activeCombatantId = null;
			s.active = false;
		});
		this.hpModeByCombatant.clear();
	}

	private async syncIfPlayer(id: string, newHp: number) {
		const c = this.store.state.combatants.find((x) => x.id === id);
		if (!c || c.kind !== "player" || !c.sourcePath) return;
		try {
			await syncPlayerCurrentHp(this.app, c.sourcePath, newHp);
		} catch (err) {
			new Notice(`Couldn't sync HP to ${c.name}'s sheet: ${(err as Error).message}`);
		}
	}

	/**
	 * Renders one combatant as a CSS Grid card (not a real <table> — that
	 * fought with Obsidian's own table styling and lost all its borders).
	 * Grid columns: [turn indicator][label][spacer][value]. Row 1 spans
	 * the label+spacer+value columns as a single flex row: Initiative,
	 * centered Name, then the remove button.
	 */
	private renderCombatantCard(list: HTMLElement, combatant: Combatant) {
		const hasLegendary = combatant.legendaryResistanceMax > 0 || combatant.legendaryActionsMax > 0;
		const rowCount = hasLegendary ? 4 : 3;
		const isActive = this.store.state.activeCombatantId === combatant.id;

		const card = list.createDiv({ cls: "eit-it-card" });
		if (isActive) card.addClass("eit-it-card-active");

		const grid = card.createDiv({ cls: "eit-it-card-grid" });

		// ---- Turn indicator: spans every row in this card ----
		const turnCell = grid.createDiv({ cls: "eit-it-turn-cell" });
		turnCell.style.gridRow = `1 / span ${rowCount}`;
		turnCell.style.gridColumn = "1";
		turnCell.createDiv({ cls: "eit-it-turn-dot" });

		// ---- Row 1: Initiative | Name (centered) | remove × ----
		const row1 = grid.createDiv({ cls: "eit-it-row1-cell" });
		row1.style.gridRow = "1";
		row1.style.gridColumn = "2 / span 3";

		const initInput = row1.createEl("input", {
			attr: { type: "number", style: "width: 4em;" },
			cls: "eit-it-init-input",
		});
		initInput.value = combatant.initiative === null ? "" : String(combatant.initiative);
		initInput.onchange = () => {
			const val = initInput.value.trim();
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c) c.initiative = val === "" ? null : parseInt(val, 10);
			});
		};

		const nameWrap = row1.createDiv({ cls: "eit-it-name-wrap" });
		nameWrap.createEl("span", { text: combatant.name, cls: "eit-it-row-name" });
		if (combatant.isGroup) {
			const splitLink = nameWrap.createEl("span", {
				text: " (split)",
				cls: "eit-it-split-link",
			});
			splitLink.onclick = () => {
				this.store.update((s) => {
					const idx = s.combatants.findIndex((c) => c.id === combatant.id);
					if (idx === -1) return;
					const individuals = splitGroup(combatant);
					s.combatants.splice(idx, 1, ...individuals);
				});
			};
		}

		const removeBtn = row1.createEl("button", { text: "×", cls: "eit-it-remove-btn" });
		removeBtn.onclick = () => {
			this.store.update((s) => {
				s.combatants = s.combatants.filter((c) => c.id !== combatant.id);
			});
		};

		// ---- Row 2: AC: | Condition ----
		this.placeCell(grid, 2, 2).setText(`AC: ${combatant.ac ?? "—"}`);
		this.placeSpacer(grid, 2);

		const condCell = this.placeCell(grid, 4, 2);
		condCell.addClass("eit-it-cell-conditions");
		for (const cond of combatant.conditions) {
			const badge = condCell.createEl("span", {
				text: cond.label,
				cls: "eit-it-condition-badge",
			});
			const removeCondBtn = badge.createEl("span", {
				text: " ×",
				cls: "eit-it-condition-remove",
			});
			removeCondBtn.onclick = () => {
				this.store.update((s) => {
					const c = s.combatants.find((x) => x.id === combatant.id);
					if (c) c.conditions = c.conditions.filter((cc) => cc.id !== cond.id);
				});
			};
		}
		const addCondSelect = condCell.createEl("select", { cls: "eit-it-cond-select" });
		addCondSelect.createEl("option", { text: "+ Condition...", attr: { value: "" } });
		for (const label of STANDARD_CONDITIONS) {
			addCondSelect.createEl("option", { text: label, attr: { value: label } });
		}
		addCondSelect.createEl("option", { text: "Custom...", attr: { value: "__custom__" } });
		addCondSelect.onchange = () => {
			const value = addCondSelect.value;
			addCondSelect.value = "";
			if (!value) return;
			let label = value;
			if (value === "__custom__") {
				const custom = prompt("Custom condition label:");
				if (!custom) return;
				label = custom;
			}
			const condition: Condition = { id: newId(), label };
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c) c.conditions.push(condition);
			});
		};

		// ---- Row 3: HP: [input] | Dmg/Heal toggle ----
		const hpCell = this.placeCell(grid, 2, 3);
		hpCell.createEl("span", { text: "HP: ", cls: "eit-it-stat-label" });
		const hpInput = hpCell.createEl("input", { attr: { type: "number", style: "width: 4em;" } });
		hpInput.value = String(combatant.currentHp);
		hpInput.onchange = () => {
			const val = parseInt(hpInput.value, 10);
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c && !isNaN(val)) c.currentHp = val;
			});
			const updated = this.store.state.combatants.find((c) => c.id === combatant.id);
			if (updated) void this.syncIfPlayer(updated.id, updated.currentHp);
		};
		this.placeSpacer(grid, 3);

		const hpToggleCell = this.placeCell(grid, 4, 3);
		const mode = this.hpModeByCombatant.get(combatant.id) ?? "damage";
		const modeBtn = hpToggleCell.createEl("button", {
			text: mode === "damage" ? "Dmg" : "Heal",
			cls: "eit-it-mode-btn",
		});
		const deltaInput = hpToggleCell.createEl("input", {
			attr: { type: "number", placeholder: "amount", style: "width: 4.5em;" },
		});
		modeBtn.onclick = () => {
			const current = this.hpModeByCombatant.get(combatant.id) ?? "damage";
			const next: HpMode = current === "damage" ? "heal" : "damage";
			this.hpModeByCombatant.set(combatant.id, next);
			modeBtn.setText(next === "damage" ? "Dmg" : "Heal");
		};
		const applyDelta = () => {
			const amount = parseInt(deltaInput.value, 10);
			if (isNaN(amount) || amount === 0) return;
			const currentMode = this.hpModeByCombatant.get(combatant.id) ?? "damage";
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (!c) return;
				if (currentMode === "damage") {
					c.currentHp = Math.max(0, c.currentHp - Math.abs(amount));
				} else {
					c.currentHp = Math.min(c.maxHp, c.currentHp + Math.abs(amount));
				}
			});
			deltaInput.value = "";
			const updated = this.store.state.combatants.find((c) => c.id === combatant.id);
			if (updated) void this.syncIfPlayer(updated.id, updated.currentHp);
		};
		deltaInput.onkeydown = (e) => {
			if (e.key === "Enter") applyDelta();
		};

		// ---- Row 4: LR: | LA: (only if applicable) ----
		if (hasLegendary) {
			const lrCell = this.placeCell(grid, 2, 4);
			if (combatant.legendaryResistanceMax > 0) {
				lrCell.createEl("span", {
					text: `LR: ${combatant.legendaryResistanceCurrent}`,
					cls: "eit-it-stat-label",
				});
				const lrMinus = lrCell.createEl("button", { text: "-1" });
				lrMinus.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryResistanceCurrent = Math.max(0, c.legendaryResistanceCurrent - 1);
					});
				};
			}
			this.placeSpacer(grid, 4);

			const laCell = this.placeCell(grid, 4, 4);
			if (combatant.legendaryActionsMax > 0) {
				laCell.createEl("span", {
					text: `LA: ${combatant.legendaryActionsCurrent}`,
					cls: "eit-it-stat-label",
				});
				const laMinus = laCell.createEl("button", { text: "-1" });
				laMinus.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryActionsCurrent = Math.max(0, c.legendaryActionsCurrent - 1);
					});
				};
			}
		}
	}

	private placeCell(grid: HTMLElement, column: number, row: number): HTMLDivElement {
		const cell = grid.createDiv({ cls: column === 2 ? "eit-it-label-cell" : "eit-it-value-cell" });
		cell.style.gridColumn = String(column);
		cell.style.gridRow = String(row);
		return cell;
	}

	private placeSpacer(grid: HTMLElement, row: number) {
		const spacer = grid.createDiv({ cls: "eit-it-spacer-cell" });
		spacer.style.gridColumn = "3";
		spacer.style.gridRow = String(row);
	}
}
