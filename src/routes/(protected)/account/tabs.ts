import { resolve } from "$app/paths";
import BellIcon from "@lucide/svelte/icons/bell";
import BotIcon from "@lucide/svelte/icons/bot";
import FingerprintIcon from "@lucide/svelte/icons/fingerprint";
import PaletteIcon from "@lucide/svelte/icons/palette";
import UserRoundIcon from "@lucide/svelte/icons/user-round";

import type { SectionTab } from "#lib/components/nav-cards.svelte";

/** The account section's pages, shared by its landing cards and its tabs. */
export function accountTabs(): SectionTab[] {
	return [
		{
			href: resolve("/(protected)/account/profile"),
			label: "Profile",
			description:
				"Your name, the email you sign in with, or delete the account.",
			icon: UserRoundIcon,
		},
		{
			href: resolve("/(protected)/account/appearance"),
			label: "Appearance",
			description: "Accent colour, light or dark, AMOLED, font and corners.",
			icon: PaletteIcon,
		},
		{
			href: resolve("/(protected)/account/security"),
			label: "Security",
			description: "Password, authenticator app, backup codes and passkeys.",
			icon: FingerprintIcon,
		},
		{
			href: resolve("/(protected)/account/notifications"),
			label: "Notifications",
			description: "Get told on this device when something needs you.",
			icon: BellIcon,
		},
		{
			href: resolve("/(protected)/account/ai-apps"),
			label: "AI apps",
			description: "Let Claude, ChatGPT or Gemini see the house and drive it.",
			icon: BotIcon,
		},
	];
}
