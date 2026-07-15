import { EncounterState, emptyEncounterState } from "./types";

type Listener = () => void;

/**
 * Holds the live encounter state, persists it via the plugin's saveData/
 * loadData after every mutation, and notifies subscribers (the view) to
 * re-render. Kept deliberately simple — combatant counts are small, so a
 * full re-render on every change is cheap and avoids diffing bugs.
 */
export class EncounterStore {
	state: EncounterState = emptyEncounterState();
	private listeners: Listener[] = [];
	private persistFn: (state: EncounterState) => Promise<void>;

	constructor(persistFn: (state: EncounterState) => Promise<void>) {
		this.persistFn = persistFn;
	}

	load(state: EncounterState | null) {
		this.state = state ?? emptyEncounterState();
		this.notify();
	}

	subscribe(fn: Listener) {
		this.listeners.push(fn);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== fn);
		};
	}

	private notify() {
		for (const l of this.listeners) l();
		void this.persistFn(this.state);
	}

	update(mutator: (state: EncounterState) => void) {
		mutator(this.state);
		this.notify();
	}
}
