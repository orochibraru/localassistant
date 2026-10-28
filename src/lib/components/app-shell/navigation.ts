import { resolve } from "$app/paths";
import HouseIcon from "@lucide/svelte/icons/house";
import LayersIcon from "@lucide/svelte/icons/layers";
import PlugIcon from "@lucide/svelte/icons/plug";
import ShieldIcon from "@lucide/svelte/icons/shield";
import UserRoundIcon from "@lucide/svelte/icons/user-round";
import type { Component } from "svelte";

export interface NavigationItem {
	href: string;
	label: string;
	icon: Component<{ class?: string }>;
}

/** The app's top-level destinations, shared by the bottom tab bar and the sidebar; admins also get Devices and Admin. */
export function navigationItems(isAdmin: boolean): NavigationItem[] {
	const items = [
		{ href: resolve("/(protected)"), label: "Home", icon: HouseIcon },
		{ href: resolve("/(protected)/house"), label: "House", icon: LayersIcon },
		{
			href: resolve("/(protected)/account"),
			label: "Account",
			icon: UserRoundIcon,
		},
	];
	if (isAdmin) {
		items.splice(2, 0, {
			href: resolve("/(protected)/devices"),
			label: "Devices",
			icon: PlugIcon,
		});
		items.push({
			href: resolve("/(protected)/admin"),
			label: "Admin",
			icon: ShieldIcon,
		});
	}
	return items;
}

/** Whether `pathname` sits under the destination at `href`. */
export function isActive(pathname: string, href: string): boolean {
	return href === "/"
		? pathname === "/"
		: pathname === href || pathname.startsWith(`${href}/`);
}
