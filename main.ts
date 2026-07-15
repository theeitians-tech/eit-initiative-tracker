import { Plugin, WorkspaceLeaf } from "obsidian";
import { TrackerView, VIEW_TYPE_TRACKER } from "./trackerView";
import { EncounterStore } from "./state";
import { EncounterState } from "./types";

export default class EitInitiativeTrackerPlugin extends Plugin {
	store: EncounterStore;

	async onload() {
		this.store = new EncounterStore(async (state: EncounterState) => {
			await this.saveData(state);
		});

		const savedState = (await this.loadData()) as EncounterState | null;
		this.store.load(savedState);

		this.registerView(VIEW_TYPE_TRACKER, (leaf) => new TrackerView(leaf, this.store));

		this.addRibbonIcon("swords", "Open Initiative Tracker", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-initiative-tracker",
			name: "Open Initiative Tracker",
			callback: () => this.activateView(),
		});
	}

	onunload() {
		// Leaves are cleaned up by Obsidian automatically; state is already
		// persisted after every mutation, so there's nothing else to flush here.
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TRACKER);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_TRACKER, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
