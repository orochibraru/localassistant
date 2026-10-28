export interface AppearanceAttributes {
	accent: string;
	theme: string;
	darkVariant: string;
	font: string;
	corners: string;
}

/** Applies an appearance to `<html>`: data attributes for accent, dark variant, font and corners, the `dark` class for the theme. */
export function applyAppearance(
	root: HTMLElement,
	appearance: AppearanceAttributes,
	prefersDark: boolean,
): void {
	root.dataset.accent = appearance.accent;
	root.dataset.darkVariant = appearance.darkVariant;
	root.dataset.font = appearance.font;
	root.dataset.corners = appearance.corners;
	const dark =
		appearance.theme === "dark" ||
		(appearance.theme === "system" && prefersDark);
	root.classList.toggle("dark", dark);
	root.style.colorScheme = dark ? "dark" : "light";
}

/** An inline script applying `appearance` before first paint, so a reload never flashes the default theme. */
export function appearanceBootScript(appearance: AppearanceAttributes): string {
	const values = JSON.stringify(appearance).replaceAll("<", "\\u003c");
	return `<script>(function(){var a=${values};var r=document.documentElement;r.dataset.accent=a.accent;r.dataset.darkVariant=a.darkVariant;r.dataset.font=a.font;r.dataset.corners=a.corners;try{localStorage.setItem("mode-watcher-mode",a.theme)}catch(e){}var d=a.theme==="dark"||(a.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})()</script>`;
}
