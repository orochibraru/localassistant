import { getContext, setContext } from "svelte";

const key = Symbol("sheets");

/** Which setup sheet is open: the shell renders them once, and anything can open one. */
export class Sheets {
	pickDevice = $state(false);
	addDevice = $state<string | null>(null);
	editDeviceId = $state<string | null>(null);
	room = $state<{ id: string | null; place?: string } | null>(null);
	floor = $state<{ id: string | null } | null>(null);
}

/** Creates the sheet controller for this app instance; the signed-in layout calls it once. */
export function provideSheets(): Sheets {
	return setContext(key, new Sheets());
}

/** The sheet controller the signed-in layout provided. */
export function useSheets(): Sheets {
	return getContext<Sheets>(key);
}
