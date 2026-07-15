import { App, Modal, Notice, TFile } from "obsidian";
import { getBestiaryFiles, getPlayerFiles } from "./vaultIndex";
import { parseStatblock } from "./parser";
import { buildCreatureCombatant, buildPlayerCombatant } from "./combatants";
import { EncounterStore } from "./state";

export class AddCombatantsModal extends Modal {
	store: EncounterStore;
	searchTerm = "";

	constructor(app: App, store: EncounterStore) {
		super(app);
		this.store = store;
	}

	onOpen() {
		this.render();
	}

	async render() {
		const { contentEl } = this;
		const scrollPos = contentEl.scrollTop;
		contentEl.empty();
		contentEl.addClass("eit-it-picker");

		contentEl.createEl("h2", { text: "Add Combatants" });

		const searchInput = contentEl.createEl("input", {
			attr: { type: "text", placeholder: "Filter by name..." },
			cls: "eit-it-search",
		});
		searchInput.value = this.searchTerm;
		searchInput.oninput = () => {
			this.searchTerm = searchInput.value;
			this.render();
		};

		const term = this.searchTerm.trim().toLowerCase();

		// ---- Players ----
		contentEl.createEl("h3", { text: "Players (#PC)" });
		const playerFiles = getPlayerFiles(this.app).filter((f) =>
			f.basename.toLowerCase().includes(term)
		);

		if (playerFiles.length === 0) {
			contentEl.createEl("p", {
				text: "No #PC notes found.",
				cls: "eit-it-empty",
			});
		} else {
			const playerList = contentEl.createDiv({ cls: "eit-it-list" });
			const checkboxes: { file: TFile; checkbox: HTMLInputElement }[] = [];

			for (const file of playerFiles) {
				const row = playerList.createDiv({ cls: "eit-it-row-picker" });
				const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
				row.createEl("span", { text: file.basename });
				checkboxes.push({ file, checkbox });
			}

			const addPlayersBtn = contentEl.createEl("button", {
				text: "Add Selected Players",
			});
			addPlayersBtn.onclick = async () => {
				const chosen = checkboxes.filter((c) => c.checkbox.checked);
				if (chosen.length === 0) {
					new Notice("No players selected.");
					return;
				}
				for (const { file } of chosen) {
					const content = await this.app.vault.read(file);
					const parsed = parseStatblock(content, file.path);
					const combatant = buildPlayerCombatant(parsed);
					this.store.update((s) => s.combatants.push(combatant));
				}
				new Notice(`Added ${chosen.length} player(s).`);
			};
		}

		// ---- Bestiary ----
		contentEl.createEl("h3", { text: "Bestiary (#bestiary)" });
		const bestiaryFiles = getBestiaryFiles(this.app).filter((f) =>
			f.basename.toLowerCase().includes(term)
		);

		if (bestiaryFiles.length === 0) {
			contentEl.createEl("p", {
				text: "No #bestiary notes found.",
				cls: "eit-it-empty",
			});
		} else {
			const bestiaryList = contentEl.createDiv({ cls: "eit-it-list" });

			for (const file of bestiaryFiles) {
				const row = bestiaryList.createDiv({ cls: "eit-it-row-picker" });
				row.createEl("span", { text: file.basename, cls: "eit-it-row-name" });

				const qtyInput = row.createEl("input", {
					attr: { type: "number", min: "1", value: "1", style: "width: 3.5em;" },
				});

				const addBtn = row.createEl("button", { text: "Add" });
				addBtn.onclick = async () => {
					const quantity = Math.max(1, parseInt(qtyInput.value, 10) || 1);
					const content = await this.app.vault.read(file);
					const parsed = parseStatblock(content, file.path);
					const combatant = buildCreatureCombatant(parsed, quantity);
					this.store.update((s) => s.combatants.push(combatant));
					new Notice(`Added ${combatant.name}.`);
				};
			}
		}

		const closeBtn = contentEl.createEl("button", {
			text: "Done",
			cls: "eit-it-done-btn",
		});
		closeBtn.onclick = () => this.close();

		contentEl.scrollTop = scrollPos;
	}

	onClose() {
		this.contentEl.empty();
	}
}
