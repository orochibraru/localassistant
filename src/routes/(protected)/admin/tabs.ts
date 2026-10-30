import { resolve } from "$app/paths";
import ActivityIcon from "@lucide/svelte/icons/activity";
import DatabaseBackupIcon from "@lucide/svelte/icons/database-backup";
import DoorOpenIcon from "@lucide/svelte/icons/door-open";
import FileJsonIcon from "@lucide/svelte/icons/file-json";
import HousePlusIcon from "@lucide/svelte/icons/house-plus";
import KeyRoundIcon from "@lucide/svelte/icons/key-round";
import MailIcon from "@lucide/svelte/icons/mail";
import MailPlusIcon from "@lucide/svelte/icons/mail-plus";
import PuzzleIcon from "@lucide/svelte/icons/puzzle";
import SparklesIcon from "@lucide/svelte/icons/sparkles";
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
			href: resolve("/(protected)/admin/plugins"),
			label: "Integrations",
			description:
				"Add integrations from GitHub, see if they're maintained, update or remove them.",
			icon: PuzzleIcon,
		},
		{
			href: resolve("/(protected)/admin/homes"),
			label: "Homes",
			description:
				"Manage several homes, each with its own floors and devices.",
			icon: HousePlusIcon,
		},
		{
			href: resolve("/(protected)/admin/backups"),
			label: "Backups",
			description: "Daily copies of the database: download or take one now.",
			icon: DatabaseBackupIcon,
		},
		{
			href: resolve("/(protected)/admin/configuration"),
			label: "Configuration",
			description: "Export or import floors, rooms and devices as JSON.",
			icon: FileJsonIcon,
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
			description: "Require stronger sign-in and set how long sessions last.",
			icon: DoorOpenIcon,
		},
		{
			href: resolve("/(protected)/admin/sign-in"),
			label: "Sign-in methods",
			description: "Passwords, passkeys and single sign-on providers.",
			icon: KeyRoundIcon,
		},
		{
			href: resolve("/(protected)/admin/ai"),
			label: "AI",
			description:
				"The in-app assistant's Claude key, and which devices AI can see.",
			icon: SparklesIcon,
		},
		{
			href: resolve("/(protected)/admin/email"),
			label: "Email",
			description: "The SMTP server invites and sign-in emails go through.",
			icon: MailIcon,
		},
	];
}
