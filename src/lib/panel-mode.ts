const storageKey = "localassistant-panel";

/** Whether this browser opens on the wall panel instead of Home. */
export function panelMode(): boolean {
	try {
		return localStorage.getItem(storageKey) === "on";
	} catch {
		return false;
	}
}

/** Makes this browser open on the wall panel, or on Home again. */
export function setPanelMode(on: boolean): void {
	try {
		if (on) {
			localStorage.setItem(storageKey, "on");
		} else {
			localStorage.removeItem(storageKey);
		}
	} catch {
		return;
	}
}
