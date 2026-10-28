const patterns = {
	tap: 10,
	success: 18,
	error: [30, 60, 30],
} satisfies Record<string, VibratePattern>;

/** A short vibration for a primary action, on devices that support it; a no-op elsewhere, iOS included. */
export function haptic(kind: keyof typeof patterns): void {
	if (typeof navigator !== "undefined" && "vibrate" in navigator) {
		navigator.vibrate(patterns[kind]);
	}
}
