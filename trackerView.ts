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

	// UI-only state that shouldn't be persisted or trigger a full re-render
	// by itself — which Damage/Heal mode each row's quick-entry is in.
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
				this.renderCombatantTable(list, combatant);
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
	 * Renders one combatant as its own bordered table: a Turn Tracker
	 * column spanning every row, then label/spacer/value columns for
	 * Name+Init, AC+Condition, HP+HP Toggle, and (if applicable) LR+LA.
	 */
	private renderCombatantTable(list: HTMLElement, combatant: Combatant) {
		const hasLegendary = combatant.legendaryResistanceMax > 0 || combatant.legendaryActionsMax > 0;
		const rowCount = hasLegendary ? 4 : 3;
		const isActive = this.store.state.activeCombatantId === combatant.id;

		const table = list.createEl("table", { cls: "eit-it-combatant-table" });
		if (isActive) table.addClass("eit-it-table-active");

		// ---- Row 1: Turn Tracker | Name | spacer | Initiative ----
		const row1 = table.createEl("tr");

		const turnCell = row1.createEl("td", {
			cls: "eit-it-turn-cell",
			attr: { rowspan: String(rowCount) },
		});
		turnCell.createDiv({ cls: "eit-it-turn-indicator" });

		const nameCell = row1.createEl("td", { cls: "eit-it-label-cell eit-it-name-cell" });
		nameCell.createEl("span", { text: combatant.name, cls: "eit-it-row-name" });
		if (combatant.isGroup) {
			const splitLink = nameCell.createEl("span", {
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
		const removeBtn = nameCell.createEl("button", { text: "×", cls: "eit-it-remove-btn" });
		removeBtn.onclick = () => {
			this.store.update((s) => {
				s.combatants = s.combatants.filter((c) => c.id !== combatant.id);
			});
		};

		row1.createEl("td", { cls: "eit-it-spacer-cell" });

		const initCell = row1.createEl("td", { cls: "eit-it-value-cell" });
		const initInput = initCell.createEl("input", {
			attr: { type: "number", style: "width: 4em;" },
		});
		initInput.value = combatant.initiative === null ? "" : String(combatant.initiative);
		initInput.onchange = () => {
			const val = initInput.value.trim();
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c) c.initiative = val === "" ? null : parseInt(val, 10);
			});
		};

		// ---- Row 2: AC | spacer | Condition ----
		const row2 = table.createEl("tr");

		const acCell = row2.createEl("td", { cls: "eit-it-label-cell" });
		acCell.createEl("span", { text: `AC ${combatant.ac ?? "—"}`, cls: "eit-it-static-stat" });

		row2.createEl("td", { cls: "eit-it-spacer-cell" });

		const condCell = row2.createEl("td", { cls: "eit-it-value-cell eit-it-cell-conditions" });
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

		// ---- Row 3: HP | spacer | HP Toggle (Damage/Heal quick entry) ----
		const row3 = table.createEl("tr");

		const hpCell = row3.createEl("td", { cls: "eit-it-label-cell" });
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
		hpCell.createEl("span", { text: `/ ${combatant.maxHp}`, cls: "eit-it-maxhp" });

		row3.createEl("td", { cls: "eit-it-spacer-cell" });

		const hpToggleCell = row3.createEl("td", { cls: "eit-it-value-cell" });
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

		// ---- Row 4: LR | spacer | LA (only if applicable) ----
		if (hasLegendary) {
			const row4 = table.createEl("tr");

			const lrCell = row4.createEl("td", { cls: "eit-it-label-cell" });
			if (combatant.legendaryResistanceMax > 0) {
				lrCell.createEl("span", {
					text: `LR ${combatant.legendaryResistanceCurrent}/${combatant.legendaryResistanceMax}`,
				});
				const lrMinus = lrCell.createEl("button", { text: "-1" });
				lrMinus.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryResistanceCurrent = Math.max(0, c.legendaryResistanceCurrent - 1);
					});
				};
				const lrReset = lrCell.createEl("button", { text: "Reset" });
				lrReset.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryResistanceCurrent = c.legendaryResistanceMax;
					});
				};
			}

			row4.createEl("td", { cls: "eit-it-spacer-cell" });

			const laCell = row4.createEl("td", { cls: "eit-it-value-cell" });
			if (combatant.legendaryActionsMax > 0) {
				laCell.createEl("span", {
					text: `LA ${combatant.legendaryActionsCurrent}/${combatant.legendaryActionsMax}`,
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
}
