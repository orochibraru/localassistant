import { resolve } from "$app/paths";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import HouseIcon from "@lucide/svelte/icons/house";
import LayersIcon from "@lucide/svelte/icons/layers";
import MapIcon from "@lucide/svelte/icons/map";
import PlugIcon from "@lucide/svelte/icons/plug";
import ShieldIcon from "@lucide/svelte/icons/shield";
import WorkflowIcon from "@lucide/svelte/icons/workflow";
import type { Component } from "svelte";

export interface NavigationItem {
	href: string;
	label: string;
	icon: Component<{ class?: string }>;
}

/**
 * The app's top-level destinations, shared by the bottom tab bar and the sidebar; admins also get Devices and Admin.
 * The account is the avatar in the app bar and the desktop header.
 */
export function navigationItems(isAdmin: boolean): NavigationItem[] {
	const items = [
		{ href: resolve("/(protected)"), label: "Home", icon: HouseIcon },
		{ href: resolve("/(protected)/house"), label: "House", icon: LayersIcon },
		{ href: resolve("/(protected)/plan"), label: "Plan", icon: MapIcon },
		{
			href: resolve("/(protected)/automations"),
			label: "Automations",
			icon: WorkflowIcon,
		},
		{ href: resolve("/(protected)/energy"), label: "Energy", icon: GaugeIcon },
	];
	if (isAdmin) {
		items.push({
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

/** The destinations of the phone's tab bar: everything but Admin, which phones reach from the account page. */
export function phoneNavigationItems(isAdmin: boolean): NavigationItem[] {
	return navigationItems(isAdmin).filter(
		(item) => item.href !== resolve("/(protected)/admin"),
	);
}

/** Whether `pathname` sits under the destination at `href`. */
export function isActive(pathname: string, href: string): boolean {
	return href === "/"
		? pathname === "/"
		: pathname === href || pathname.startsWith(`${href}/`);
}
