import { resolve } from "$app/paths";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import HouseIcon from "@lucide/svelte/icons/house";
import LayersIcon from "@lucide/svelte/icons/layers";
import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
import MapIcon from "@lucide/svelte/icons/map";
import PlugIcon from "@lucide/svelte/icons/plug";
import ScrollTextIcon from "@lucide/svelte/icons/scroll-text";
import ShieldIcon from "@lucide/svelte/icons/shield";
import SparklesIcon from "@lucide/svelte/icons/sparkles";
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
			label: "Routines",
			icon: WorkflowIcon,
		},
		{ href: resolve("/(protected)/energy"), label: "Energy", icon: GaugeIcon },
		{
			href: resolve("/(protected)/assistant"),
			label: "Assistant",
			icon: SparklesIcon,
		},
		{
			href: resolve("/(protected)/dashboards"),
			label: "Dashboards",
			icon: LayoutDashboardIcon,
		},
		{
			href: resolve("/(protected)/logbook"),
			label: "Logbook",
			icon: ScrollTextIcon,
		},
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

/** The phone's tab bar: the four daily destinations as tabs, the rest behind its More drawer. */
export function phoneNavigation(isAdmin: boolean): {
	tabs: NavigationItem[];
	more: NavigationItem[];
} {
	const daily = new Set<string>([
		resolve("/(protected)"),
		resolve("/(protected)/plan"),
		resolve("/(protected)/automations"),
		resolve("/(protected)/energy"),
	]);
	const items = navigationItems(isAdmin);
	return {
		tabs: items.filter((item) => daily.has(item.href)),
		more: items.filter((item) => !daily.has(item.href)),
	};
}

/** Whether `pathname` sits under the destination at `href`. */
export function isActive(pathname: string, href: string): boolean {
	return href === "/"
		? pathname === "/"
		: pathname === href || pathname.startsWith(`${href}/`);
}
