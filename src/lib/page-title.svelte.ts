import { type Component, getContext, setContext } from "svelte";

const key = Symbol("page-title");

/**
 * An action in the page header: a link or a button. A primary action shows as a filled button on desktop only, since
 * phones reach it through the floating button.
 */
export interface HeaderAction {
	label: string;
	icon: Component<{ class?: string }>;
	href?: string;
	onSelect?: () => void;
	primary?: boolean;
}

export class PageTitle {
	current = $state("");
	backHref = $state<string | undefined>();
	actions = $state<HeaderAction[]>([]);
}

type Value<Type> = Type | (() => Type);

function read<Type>(value: Value<Type>): Type {
	return typeof value === "function" ? (value as () => Type)() : value;
}

/** Creates the page title holder for this app instance; the root layout calls it once. */
export function providePageTitle(): PageTitle {
	return setContext(key, new PageTitle());
}

/** The page title holder, for the app bars. */
export function usePageTitle(): PageTitle {
	return getContext<PageTitle>(key);
}

/**
 * Sets the title the app bar shows for the current page, where its back button goes and the icon links on its right;
 * call it while a page or layout initialises. Pass functions to follow data that changes while the component stays
 * mounted.
 */
export function setPageTitle(
	title: Value<string>,
	backHref?: Value<string | undefined>,
	actions?: Value<HeaderAction[]>,
): void {
	const holder = usePageTitle();
	const apply = () => {
		holder.current = read(title);
		holder.backHref = backHref === undefined ? undefined : read(backHref);
		holder.actions = actions === undefined ? [] : read(actions);
	};
	apply();
	$effect.pre(apply);
}
