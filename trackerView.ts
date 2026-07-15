import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { EncounterStore } from "./state";
import { Combatant, Condition, STANDARD_CONDITIONS, newId } from "./types";
import { splitGroup } from "./combatants";
import { AddCombatantsModal } from "./pickerModal";
import { syncPlayerCurrentHp } from "./sync";

export const VIEW_TYPE_TRACKER = "eit-initiative-tracker-view";

export class TrackerView extends ItemView {
	store: EncounterStore;
	unsubscribe: (() => void) | null = null;

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
				text: "No combatants yet. Click \"Add Combatants\" to pull from your #bestiary and #PC notes.",
				cls: "eit-it-empty",
			});
		} else {
			const list = container.createDiv({ cls: "eit-it-combatant-list" });
			for (const combatant of sorted) {
				this.renderRow(list, combatant);
			}
		}

		container.scrollTop = scrollPos;
	}

	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "eit-it-toolbar" });

		const addBtn = toolbar.createEl("button", { text: "Add Combatants" });
		addBtn.onclick = () => new AddCombatantsModal(this.app, this.store).open();

		const rollBtn = toolbar.createEl("button", { text: "Roll Monsters" });
		rollBtn.onclick = () => this.rollMonsters();

		const nextBtn = toolbar.createEl("button", { text: "Next Turn" });
		nextBtn.onclick = () => this.nextTurn();

		const resetBtn = toolbar.createEl("button", {
			text: "Reset Encounter",
			cls: "eit-it-danger-btn",
		});
		resetBtn.onclick = () => this.resetEncounter();

		toolbar.createEl("span", {
			text: `Round ${this.store.state.round}`,
			cls: "eit-it-round-badge",
		});
	}

	private rollMonsters() {
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
			if (!s.active) {
				s.active = true;
				s.activeCombatantId = sorted[0].id;
			} else {
				const currentIndex = sorted.findIndex((c) => c.id === s.activeCombatantId);
				let nextIndex = currentIndex + 1;
				if (currentIndex === -1) {
					nextIndex = 0; // active combatant was removed; restart at top
				} else if (nextIndex >= sorted.length) {
					nextIndex = 0;
					s.round += 1;
				}
				s.activeCombatantId = sorted[nextIndex].id;
			}

			// Refill legendary actions for whoever's turn it now is.
			const active = s.combatants.find((c) => c.id === s.activeCombatantId);
			if (active && active.legendaryActionsMax > 0) {
				active.legendaryActionsCurrent = active.legendaryActionsMax;
			}
		});
	}

	private resetEncounter() {
		if (!confirm("Clear the entire encounter? This can't be undone.")) return;
		this.store.update((s) => {
			s.combatants = [];
			s.round = 1;
			s.activeCombatantId = null;
			s.active = false;
		});
	}

	/**
	 * If the given combatant is a player tied to a real vault note, writes
	 * their current HP back to that note's **Current HP** line. Silent on
	 * success (this runs after every HP edit); surfaces a Notice if the
	 * write fails so the sheet doesn't silently fall out of sync.
	 */
	private async syncIfPlayer(id: string, newHp: number) {
		const c = this.store.state.combatants.find((x) => x.id === id);
		if (!c || c.kind !== "player" || !c.sourcePath) return;
		try {
			await syncPlayerCurrentHp(this.app, c.sourcePath, newHp);
		} catch (err) {
			new Notice(`Couldn't sync HP to ${c.name}'s sheet: ${(err as Error).message}`);
		}
	}

	private renderRow(list: HTMLElement, combatant: Combatant) {
		const row = list.createDiv({ cls: "eit-it-row" });
		if (this.store.state.activeCombatantId === combatant.id) {
			row.addClass("eit-it-row-active");
		}

		// ---- Header line: name, initiative, remove ----
		const header = row.createDiv({ cls: "eit-it-row-header" });

		header.createEl("span", { text: combatant.name, cls: "eit-it-row-name" });

		const initLabel = header.createEl("label", { text: "Init", cls: "eit-it-inline-label" });
		const initInput = initLabel.createEl("input", {
			attr: { type: "number", style: "width: 3.5em;" },
		});
		initInput.value = combatant.initiative === null ? "" : String(combatant.initiative);
		initInput.onchange = () => {
			const val = initInput.value.trim();
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c) c.initiative = val === "" ? null : parseInt(val, 10);
			});
		};

		const removeBtn = header.createEl("button", { text: "×", cls: "eit-it-remove-btn" });
		removeBtn.onclick = () => {
			this.store.update((s) => {
				s.combatants = s.combatants.filter((c) => c.id !== combatant.id);
			});
		};

		// ---- Stats line: AC, HP, HP delta ----
		const stats = row.createDiv({ cls: "eit-it-row-stats" });

		const acLabel = stats.createEl("label", { text: "AC", cls: "eit-it-inline-label" });
		const acInput = acLabel.createEl("input", {
			attr: { type: "number", style: "width: 3em;" },
		});
		acInput.value = combatant.ac === null ? "" : String(combatant.ac);
		acInput.onchange = () => {
			const val = acInput.value.trim();
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c) c.ac = val === "" ? null : parseInt(val, 10);
			});
		};

		const hpLabel = stats.createEl("label", { text: "HP", cls: "eit-it-inline-label" });
		const hpInput = hpLabel.createEl("input", {
			attr: { type: "number", style: "width: 4em;" },
		});
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
		stats.createEl("span", { text: `/ ${combatant.maxHp}`, cls: "eit-it-maxhp" });

		const deltaInput = stats.createEl("input", {
			attr: {
				type: "number",
				placeholder: "±dmg/heal",
				style: "width: 5.5em;",
			},
		});
		const applyDeltaBtn = stats.createEl("button", { text: "Apply" });
		applyDeltaBtn.onclick = () => {
			const delta = parseInt(deltaInput.value, 10);
			if (isNaN(delta)) return;
			this.store.update((s) => {
				const c = s.combatants.find((x) => x.id === combatant.id);
				if (c) c.currentHp = Math.max(0, c.currentHp + delta);
			});
			deltaInput.value = "";
			const updated = this.store.state.combatants.find((c) => c.id === combatant.id);
			if (updated) void this.syncIfPlayer(updated.id, updated.currentHp);
		};

		if (combatant.isGroup) {
			const splitBtn = stats.createEl("button", { text: "Split into individuals" });
			splitBtn.onclick = () => {
				this.store.update((s) => {
					const idx = s.combatants.findIndex((c) => c.id === combatant.id);
					if (idx === -1) return;
					const individuals = splitGroup(combatant);
					s.combatants.splice(idx, 1, ...individuals);
				});
			};
		}

		// ---- Legendary line (only if applicable) ----
		if (combatant.legendaryResistanceMax > 0 || combatant.legendaryActionsMax > 0) {
			const legendary = row.createDiv({ cls: "eit-it-row-legendary" });

			if (combatant.legendaryResistanceMax > 0) {
				legendary.createEl("span", {
					text: `LR ${combatant.legendaryResistanceCurrent}/${combatant.legendaryResistanceMax}`,
				});
				const lrMinus = legendary.createEl("button", { text: "-1 LR" });
				lrMinus.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryResistanceCurrent = Math.max(0, c.legendaryResistanceCurrent - 1);
					});
				};
				const lrReset = legendary.createEl("button", { text: "Reset LR" });
				lrReset.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryResistanceCurrent = c.legendaryResistanceMax;
					});
				};
			}

			if (combatant.legendaryActionsMax > 0) {
				legendary.createEl("span", {
					text: `LA ${combatant.legendaryActionsCurrent}/${combatant.legendaryActionsMax}`,
				});
				const laMinus = legendary.createEl("button", { text: "-1 LA" });
				laMinus.onclick = () => {
					this.store.update((s) => {
						const c = s.combatants.find((x) => x.id === combatant.id);
						if (c) c.legendaryActionsCurrent = Math.max(0, c.legendaryActionsCurrent - 1);
					});
				};
			}
		}

		// ---- Conditions ----
		const conditionsRow = row.createDiv({ cls: "eit-it-row-conditions" });
		for (const cond of combatant.conditions) {
			const badge = conditionsRow.createEl("span", {
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

		const addCondSelect = conditionsRow.createEl("select");
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
	}
}
