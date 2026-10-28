import type { Action } from "svelte/action";

import { haptic } from "#lib/haptics.js";

const holdMs = 450;
const slopPx = 10;

/**
 * Calls `onLongPress` when a touch is held still on the node, with a short vibration, keeps the browser's own menu away
 * and swallows the tap the release would make.
 */
export const longPress: Action<HTMLElement, () => void> = (
	node,
	onLongPress,
) => {
	let callback = onLongPress;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let start: { x: number; y: number } | undefined;
	let fired = false;

	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
		start = undefined;
	};
	const down = (event: PointerEvent) => {
		if (event.pointerType === "mouse") {
			return;
		}
		fired = false;
		start = { x: event.clientX, y: event.clientY };
		timer = setTimeout(() => {
			haptic("tap");
			fired = true;
			callback();
			cancel();
		}, holdMs);
	};
	const move = (event: PointerEvent) => {
		if (
			start &&
			Math.hypot(event.clientX - start.x, event.clientY - start.y) > slopPx
		) {
			cancel();
		}
	};
	const contextMenu = (event: Event) => {
		event.preventDefault();
	};
	const click = (event: Event) => {
		if (fired) {
			fired = false;
			event.preventDefault();
			event.stopPropagation();
		}
	};

	node.addEventListener("pointerdown", down);
	node.addEventListener("pointermove", move);
	node.addEventListener("pointerup", cancel);
	node.addEventListener("pointercancel", cancel);
	node.addEventListener("contextmenu", contextMenu);
	node.addEventListener("click", click, true);

	return {
		update(next) {
			callback = next;
		},
		destroy() {
			cancel();
			node.removeEventListener("pointerdown", down);
			node.removeEventListener("pointermove", move);
			node.removeEventListener("pointerup", cancel);
			node.removeEventListener("pointercancel", cancel);
			node.removeEventListener("contextmenu", contextMenu);
			node.removeEventListener("click", click, true);
		},
	};
};
