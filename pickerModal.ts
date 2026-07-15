import { App, Modal, Notice, TFile } from "obsidian";
import { getBestiaryFiles, getPlayerFiles } from "./vaultIndex";
import { parseStatblock } from "./parser";
import { buildCreatureCombatant, buildPlayerCombatant } from "./combatants";
import { EncounterStore } from "./state";

export class AddCombatantsModal extends Modal {
	store: EncounterStore;

	// Cached file lists so we don't re-scan the vault on every keystroke
	private bestiaryFiles: TFile[] = [];
	private playerFiles: TFile[] = [];

	// DOM refs we need to update without rebuilding
	private playerListEl: HTMLElement | null = null;
	private bestiaryListEl: HTMLElement | null = null;
	private playerSearchEl: HTMLInputElement | null = null;
	private bestiarySearchEl: HTMLInputElement | null = null;

	constructor(app: App, store: EncounterStore) {
		super(app);
		this.store = store;
	}

	onOpen() {
		this.bestiaryFiles = getBestiaryFiles(this.app);
		this.playerFiles = getPlayerFiles(this.app);
		this.buildLayout();
	}

	/**
	 * Builds the modal structure once. Search inputs update only the
	 * dropdown lists beneath them — no full re-render, no focus loss.
	 */
	private buildLayout() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("eit-it-picker");

		contentEl.createEl("h2", { text: "Add Combatants" });

		// ---- Players section ----
		contentEl.createEl("h3", { text: "Players" });

		this.playerSearchEl = contentEl.createEl("input", {
			attr: { type: "text", placeholder: "Search players..." },
			cls: "eit-it-search",
		});
		this.playerListEl = contentEl.createDiv({ cls: "eit-it-dropdown-list" });

		this.playerSearchEl.oninput = () => this.renderPlayerList();
		this.renderPlayerList();

		// ---- Bestiary section ----
		contentEl.createEl("h3", { text: "Bestiary" });

		this.bestiarySearchEl = contentEl.createEl("input", {
			attr: { type: "text", placeholder: "Search bestiary..." },
			cls: "eit-it-search",
		});
		this.bestiaryListEl = contentEl.createDiv({ cls: "eit-it-dropdown-list" });

		this.bestiarySearchEl.oninput = () => this.renderBestiaryList();
		this.renderBestiaryList();

		// ---- Close button ----
		const closeBtn = contentEl.createEl("button", {
			text: "Done",
			cls: "eit-it-done-btn",
		});
		closeBtn.onclick = () => this.close();
	}

	/**
	 * Rebuilds only the player dropdown list. The search input, headings,
	 * and bestiary section are untouched — no focus loss.
	 */
	private renderPlayerList() {
		if (!this.playerListEl || !this.playerSearchEl) return;
		this.playerListEl.empty();

		const term = this.playerSearchEl.value.trim().toLowerCase();
		const filtered = this.playerFiles.filter((f) =>
			f.basename.toLowerCase().includes(term)
		);

		if (filtered.length === 0) {
			this.playerListEl.createEl("div", {
				text: term ? "No matching players." : "No #PC notes found.",
				cls: "eit-it-dropdown-empty",
			});
			return;
		}

		for (const file of filtered) {
			const row = this.playerListEl.createDiv({ cls: "eit-it-dropdown-item" });
			row.createEl("span", { text: file.basename, cls: "eit-it-dropdown-name" });

			const addBtn = row.createEl("button", { text: "Add" });
			addBtn.onclick = async () => {
				const content = await this.app.vault.read(file);
				const parsed = parseStatblock(content, file.path);
				const combatant = buildPlayerCombatant(parsed);
				this.store.update((s) => s.combatants.push(combatant));
				new Notice(`Added ${combatant.name}.`);
				row.addClass("eit-it-dropdown-item-added");
			};
		}
	}

	/**
	 * Rebuilds only the bestiary dropdown list. Same isolation principle.
	 */
	private renderBestiaryList() {
		if (!this.bestiaryListEl || !this.bestiarySearchEl) return;
		this.bestiaryListEl.empty();

		const term = this.bestiarySearchEl.value.trim().toLowerCase();
		const filtered = this.bestiaryFiles.filter((f) =>
			f.basename.toLowerCase().includes(term)
		);

		if (filtered.length === 0) {
			this.bestiaryListEl.createEl("div", {
				text: term ? "No matching creatures." : "No #bestiary notes found.",
				cls: "eit-it-dropdown-empty",
			});
			return;
		}

		for (const file of filtered) {
			const row = this.bestiaryListEl.createDiv({ cls: "eit-it-dropdown-item" });
			row.createEl("span", { text: file.basename, cls: "eit-it-dropdown-name" });

			const qtyInput = row.createEl("input", {
				attr: { type: "number", min: "1", value: "1" },
				cls: "eit-it-qty-input",
			});

			const addBtn = row.createEl("button", { text: "Add" });
			addBtn.onclick = async () => {
				const quantity = Math.max(1, parseInt(qtyInput.value, 10) || 1);
				const content = await this.app.vault.read(file);
				const parsed = parseStatblock(content, file.path);
				const combatant = buildCreatureCombatant(parsed, quantity);
				this.store.update((s) => s.combatants.push(combatant));
				new Notice(`Added ${combatant.name}.`);
				row.addClass("eit-it-dropdown-item-added");
			};
		}
	}

	onClose() {
		this.contentEl.empty();
		this.playerListEl = null;
		this.bestiaryListEl = null;
		this.playerSearchEl = null;
		this.bestiarySearchEl = null;
	}
}
