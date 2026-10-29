import type { CardSize } from "#lib/devices.js";

export const pluginCards = [
	"cover",
	"climate",
	"printer",
	"vacuum",
	"contact",
	"valve",
	"switch",
	"meter",
	"linky",
	"camera",
	"light",
	"lock",
	"fan",
	"media",
	"sensor",
	"button",
	"app",
] as const;
export type PluginCard = (typeof pluginCards)[number];

export const pluginIcons = [
	"blinds",
	"bot",
	"cctv",
	"door-open",
	"fan",
	"gauge",
	"heater",
	"droplets",
	"lightbulb",
	"lock",
	"mouse-pointer-click",
	"plug",
	"printer",
	"puzzle",
	"smartphone",
	"speaker",
	"thermometer",
	"tv",
	"zap",
] as const;
export type PluginIcon = (typeof pluginIcons)[number];

export const pluginFieldTypes = [
	"text",
	"secret",
	"number",
	"boolean",
	"choice",
] as const;
export type PluginFieldType = (typeof pluginFieldTypes)[number];

export const pluginNeeds = ["mqtt"] as const;

export const pluginRuntimes = ["bun", "process"] as const;
export type PluginRuntime = (typeof pluginRuntimes)[number];

export const pluginPlatforms = [
	"linux-x64",
	"linux-arm64",
	"darwin-x64",
	"darwin-arm64",
] as const;
export type PluginPlatform = (typeof pluginPlatforms)[number];

export const pluginInterpreters = ["python3"] as const;
export type PluginInterpreter = (typeof pluginInterpreters)[number];
export type PluginNeed = (typeof pluginNeeds)[number];

export type PluginValue = string | number | boolean;
export type PluginValues = Record<string, PluginValue>;

export interface PluginChoice {
	value: string;
	label: string;
}

export interface PluginField {
	name: string;
	label: string;
	type: PluginFieldType;
	description?: string;
	placeholder?: string;
	optional?: boolean;
	default?: PluginValue;
	choices?: PluginChoice[];
	min?: number;
	max?: number;
	pattern?: string;
	message?: string;
	keyboard?: "decimal" | "url" | "email";
}

export interface PluginKind {
	id: string;
	label: string;
	card: PluginCard;
	icon: PluginIcon;
	size?: CardSize;
	order?: number;
	houseMeter?: boolean;
	polled?: boolean;
}

export interface PluginConnection {
	description: string;
	connected: string;
	fields: PluginField[];
	find?: string;
}

export interface PluginDeviceForm {
	title: string;
	description: string;
	fields: PluginField[];
	submit: string;
}

export interface PluginManifest {
	id: string;
	name: string;
	description: string;
	author?: string;
	version: string;
	localassistant?: string;
	runtime: PluginRuntime;
	entry: string | Partial<Record<PluginPlatform, string>>;
	interpreter?: PluginInterpreter;
	files: string[];
	icon: PluginIcon;
	needs: PluginNeed[];
	connection?: PluginConnection;
	device?: PluginDeviceForm;
	automatic?: string;
	kinds: PluginKind[];
}

export const pluginSourceKinds = [
	"github",
	"gitlab",
	"gitea",
	"folder",
] as const;
export type PluginSourceKind = (typeof pluginSourceKinds)[number];

export const pluginHealths = [
	"official",
	"local",
	"maintained",
	"quiet",
	"unmaintained",
	"archived",
	"unknown",
] as const;
export type PluginHealth = (typeof pluginHealths)[number];

export const pluginHealthLabels: Record<PluginHealth, string> = {
	official: "Official",
	local: "Local folder",
	maintained: "Maintained",
	quiet: "Little activity",
	unmaintained: "Not maintained",
	archived: "Archived",
	unknown: "Not checked yet",
};

export const pluginHealthDescriptions: Record<PluginHealth, string> = {
	official: "Ships with LocalAssistant and is updated with it.",
	local:
		"Read from a folder on this server: it changes when you change its files.",
	maintained: "Its author changed it in the last six months.",
	quiet: "Nothing changed in six months to a year. It may still work fine.",
	unmaintained:
		"Nothing changed in over a year. It may break with a device update.",
	archived: "Its author stopped working on it and locked the repository.",
	unknown: "LocalAssistant hasn't asked GitHub about it yet.",
};

export interface PluginStatus {
	health: PluginHealth;
	url: string | null;
	stars: number | null;
	pushedAt: string | null;
	latestVersion: string | null;
	latestRef: string | null;
	checkedAt: string | null;
}

export interface KindInfo {
	plugin: string;
	label: string;
	card: PluginCard;
	icon: PluginIcon;
	size: CardSize;
	order: number;
	houseMeter: boolean;
}

export type KindCatalog = Record<string, KindInfo>;

export interface PluginSetup {
	id: string;
	name: string;
	description: string;
	icon: PluginIcon;
	needs: PluginNeed[];
	connection: PluginConnection | null;
	device: PluginDeviceForm | null;
	automatic: string | null;
	connected: boolean;
	values: PluginValues;
	secretsSet: string[];
}

export interface PluginSummary {
	id: string;
	name: string;
	description: string;
	author: string | null;
	version: string;
	icon: PluginIcon;
	official: boolean;
	enabled: boolean;
	site: string;
	url: string | null;
	status: PluginStatus;
	updateAvailable: boolean;
	compatible: boolean;
	loadError: string | null;
	kinds: string[];
	devices: number;
}

export interface PluginPreview {
	link: string;
	repository: string;
	path: string;
	ref: string;
	site: string;
	url: string | null;
	manifest: PluginManifest;
	status: PluginStatus;
	compatible: boolean;
	installed: boolean;
	conflict: string | null;
}

export interface PluginListing {
	repository: string;
	name: string;
	description: string;
	site: string;
	url: string;
	stars: number;
	health: PluginHealth;
	installed: boolean;
}

const fallbackKind: KindInfo = {
	plugin: "",
	label: "Unknown device",
	card: "sensor",
	icon: "puzzle",
	size: "medium",
	order: 9,
	houseMeter: false,
};

/** What the catalog knows about `kind`, or a neutral stand-in for a kind whose plugin is gone. */
export function kindInfo(
	catalog: KindCatalog | undefined,
	kind: string,
): KindInfo {
	return catalog?.[kind] ?? fallbackKind;
}

/** The devices among `devices` whose kind shows one of `cards`. */
export function withCard<Device extends { kind: string }>(
	catalog: KindCatalog | undefined,
	devices: Device[],
	...cards: PluginCard[]
): Device[] {
	return devices.filter((device) =>
		cards.includes(kindInfo(catalog, device.kind).card),
	);
}

/** The size a device's card shows at: what the account picked, else what its kind suggests. */
export function cardSizeOf(
	sizes: Record<string, CardSize> | undefined,
	device: { id: string; kind: string },
	catalog: KindCatalog | undefined,
): CardSize {
	return sizes?.[device.id] ?? kindInfo(catalog, device.kind).size;
}

/** Cards in the order the account arranged them; the ones it never placed follow, by kind and then name. */
export function sortCards<
	Card extends { id: string; kind: string; name: string },
>(cards: Card[], order: string[], catalog: KindCatalog | undefined): Card[] {
	const position = new Map(order.map((id, index) => [id, index]));
	return cards.toSorted(
		(first, second) =>
			(position.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
				(position.get(second.id) ?? Number.MAX_SAFE_INTEGER) ||
			kindInfo(catalog, first.kind).order -
				kindInfo(catalog, second.kind).order ||
			first.name.localeCompare(second.name),
	);
}
