import { resolve } from "$app/paths";
import ActivityIcon from "@lucide/svelte/icons/activity";
import DoorOpenIcon from "@lucide/svelte/icons/door-open";
import KeyRoundIcon from "@lucide/svelte/icons/key-round";
import MailIcon from "@lucide/svelte/icons/mail";
import MailPlusIcon from "@lucide/svelte/icons/mail-plus";
import PlugIcon from "@lucide/svelte/icons/plug";
import UsersIcon from "@lucide/svelte/icons/users";

import type { SectionTab } from "#lib/components/nav-cards.svelte";

/** The admin area's sections, shared by its landing cards and its tabs. */
export function adminTabs(): SectionTab[] {
	return [
		{
			href: resolve("/(protected)/admin/overview"),
			label: "Overview",
			description: "Setup checklist, server health and background jobs.",
			icon: ActivityIcon,
		},
		{
			href: resolve("/(protected)/admin/devices"),
			label: "Devices",
			description: "Tuya blinds on your network and your MELCloud account.",
			icon: PlugIcon,
		},
		{
			href: resolve("/(protected)/admin/users"),
			label: "Users",
			description: "Every account: roles, email, sign-in factors, sessions.",
			icon: UsersIcon,
		},
		{
			href: resolve("/(protected)/admin/invites"),
			label: "Invites",
			description: "Invite people by email or link, revoke pending invites.",
			icon: MailPlusIcon,
		},
		{
			href: resolve("/(protected)/admin/access"),
			label: "Access",
			description: "Open or close sign-ups and require stronger sign-in.",
			icon: DoorOpenIcon,
		},
		{
			href: resolve("/(protected)/admin/sign-in"),
			label: "Sign-in methods",
			description: "Passwords, passkeys and single sign-on providers.",
			icon: KeyRoundIcon,
		},
		{
			href: resolve("/(protected)/admin/email"),
			label: "Email",
			description: "The SMTP server invites and sign-up codes go through.",
			icon: MailIcon,
		},
	];
}
