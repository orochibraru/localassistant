export const roomIconLabels = {
	door: "Room",
	entrance: "Entrance",
	stairs: "Staircase",
	living: "Living room",
	lounge: "Lounge",
	dining: "Dining room",
	kitchen: "Kitchen",
	pantry: "Pantry",
	bedroom: "Bedroom",
	guest: "Guest room",
	kids: "Kids' room",
	playroom: "Playroom",
	bathroom: "Bathroom",
	dressing: "Dressing room",
	laundry: "Laundry",
	office: "Office",
	study: "Study",
	meeting: "Meeting room",
	library: "Library",
	music: "Music studio",
	recording: "Recording booth",
	art: "Art studio",
	photo: "Photo studio",
	sewing: "Sewing room",
	cinema: "Cinema",
	tv: "TV room",
	gaming: "Game room",
	gym: "Gym",
	cellar: "Cellar",
	storage: "Storage",
	utility: "Boiler room",
	server: "Server room",
	pets: "Pets",
	garage: "Garage",
	carport: "Carport",
	shed: "Shed",
	workshop: "Workshop",
	greenhouse: "Greenhouse",
	terrace: "Terrace",
	garden: "Garden",
} as const;

export type RoomIcon = keyof typeof roomIconLabels;

export const roomIcons = Object.keys(roomIconLabels) as [
	RoomIcon,
	...RoomIcon[],
];

export const outsidePlace = "outside";
export const noFloorPlace = "none";

export const planSize = { columns: 48, rows: 32 } as const;

export interface RoomPlan {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The outline of a room made of `parts`, as an SVG path in plan cells: every cell edge with no cell of the room across it. */
export function planOutline(parts: RoomPlan[]): string {
	const cells = new Set<string>();
	for (const part of parts) {
		for (let x = part.x; x < part.x + part.width; x++) {
			for (let y = part.y; y < part.y + part.height; y++) {
				cells.add(`${x},${y}`);
			}
		}
	}
	const edges: string[] = [];
	for (const cell of cells) {
		const [x = 0, y = 0] = cell.split(",").map(Number);
		if (!cells.has(`${x},${y - 1}`)) {
			edges.push(`M${x} ${y}h1`);
		}
		if (!cells.has(`${x},${y + 1}`)) {
			edges.push(`M${x} ${y + 1}h1`);
		}
		if (!cells.has(`${x - 1},${y}`)) {
			edges.push(`M${x} ${y}v1`);
		}
		if (!cells.has(`${x + 1},${y}`)) {
			edges.push(`M${x + 1} ${y}v1`);
		}
	}
	return edges.join("");
}

export type PlanSide = "right" | "down" | "left" | "up";

/** A new part of up to 3 cells against `side` of `part`, as deep as the plan allows, or null at the plan's edge. */
export function extendPart(part: RoomPlan, side: PlanSide): RoomPlan | null {
	const depth = 3;
	if (side === "right" || side === "left") {
		const room =
			side === "right" ? planSize.columns - (part.x + part.width) : part.x;
		const width = Math.min(depth, room);
		if (width < 1) {
			return null;
		}
		return {
			x: side === "right" ? part.x + part.width : part.x - width,
			y: part.y,
			width,
			height: part.height,
		};
	}
	const room =
		side === "down" ? planSize.rows - (part.y + part.height) : part.y;
	const height = Math.min(depth, room);
	if (height < 1) {
		return null;
	}
	return {
		x: part.x,
		y: side === "down" ? part.y + part.height : part.y - height,
		width: part.width,
		height,
	};
}

/** `part` cut in two across its longer side, or null for a single cell. */
export function splitPart(part: RoomPlan): [RoomPlan, RoomPlan] | null {
	if (part.width >= part.height && part.width > 1) {
		const left = Math.floor(part.width / 2);
		return [
			{ ...part, width: left },
			{ ...part, x: part.x + left, width: part.width - left },
		];
	}
	if (part.height > 1) {
		const top = Math.floor(part.height / 2);
		return [
			{ ...part, height: top },
			{ ...part, y: part.y + top, height: part.height - top },
		];
	}
	return null;
}

/** The floor the plan outlines under the others: the one the home picked while it still exists, else the lowest. */
export function planBaseFloor(
	floors: HouseFloor[],
	chosenId: string | null,
): HouseFloor | undefined {
	return (
		floors.find((floor) => floor.id === chosenId) ??
		floors.toSorted((first, second) => first.level - second.level)[0]
	);
}

/** The first spot of the plan, row by row, where a `width` by `height` part overlaps none of `taken`; the top left corner when it's full. */
export function freePlanSpot(
	taken: RoomPlan[],
	width = 6,
	height = 4,
): RoomPlan {
	for (let y = 0; y + height <= planSize.rows; y++) {
		for (let x = 0; x + width <= planSize.columns; x++) {
			const overlaps = taken.some(
				(other) =>
					x < other.x + other.width &&
					other.x < x + width &&
					y < other.y + other.height &&
					other.y < y + height,
			);
			if (!overlaps) {
				return { x, y, width, height };
			}
		}
	}
	return { x: 0, y: 0, width, height };
}

export interface HouseRoom {
	id: string;
	name: string;
	icon: string;
	floorId: string | null;
	outdoor: boolean;
}

export interface HouseFloor {
	id: string;
	name: string;
	level: number;
}

export interface HouseGroup {
	id: string;
	name: string;
	rooms: HouseRoom[];
}

/**
 * The house as the sidebar and the house page show it: each floor lowest first with its rooms, then the rooms on no
 * floor, then outside. Groups without rooms are dropped unless `keepEmptyFloors` is set.
 */
export function houseGroups(
	floors: HouseFloor[],
	rooms: HouseRoom[],
	keepEmptyFloors = false,
): HouseGroup[] {
	const byName = (first: HouseRoom, second: HouseRoom) =>
		first.name.localeCompare(second.name);
	const groups: HouseGroup[] = floors.map((floor) => ({
		id: floor.id,
		name: floor.name,
		rooms: rooms
			.filter((room) => !room.outdoor && room.floorId === floor.id)
			.toSorted(byName),
	}));
	const floorIds = new Set(floors.map((floor) => floor.id));
	groups.push(
		{
			id: noFloorPlace,
			name: floors.length > 0 ? "Other rooms" : "Rooms",
			rooms: rooms
				.filter(
					(room) =>
						!room.outdoor && (!room.floorId || !floorIds.has(room.floorId)),
				)
				.toSorted(byName),
		},
		{
			id: outsidePlace,
			name: "Outside",
			rooms: rooms.filter((room) => room.outdoor).toSorted(byName),
		},
	);
	return groups.filter(
		(group) =>
			group.rooms.length > 0 || (keepEmptyFloors && floorIds.has(group.id)),
	);
}

/** The value a place picker holds for a room: a floor id, outside, or no floor. */
export function placeOf(room: Pick<HouseRoom, "floorId" | "outdoor">): string {
	if (room.outdoor) {
		return outsidePlace;
	}
	return room.floorId ?? noFloorPlace;
}

const iconKeywords: [RoomIcon, string[]][] = [
	["stairs", ["stair", "stairs", "staircase", "stairwell", "escalier"]],
	["kids", ["kid", "child", "enfant", "bebe", "baby", "nursery"]],
	[
		"bathroom",
		[
			"bath",
			"salle de bain",
			"salle d'eau",
			"shower",
			"douche",
			"toilet",
			"wc",
		],
	],
	["dining", ["dining", "salle a manger"]],
	["laundry", ["laundry", "buanderie", "lingerie"]],
	["gym", ["gym", "fitness", "salle de sport"]],
	["kitchen", ["kitchen", "cuisine"]],
	["playroom", ["playroom", "salle de jeux", "toy", "jouet"]],
	["guest", ["guest", "amis", "invite"]],
	["dressing", ["dressing", "closet", "wardrobe", "penderie"]],
	["bedroom", ["bedroom", "chambre", "bed", "suite"]],
	["living", ["living", "salon", "sejour", "family room"]],
	["library", ["library", "bibliotheque"]],
	["lounge", ["lounge", "reading", "lecture"]],
	["cinema", ["cinema", "theater", "theatre", "projection"]],
	["tv", ["tv", "tele"]],
	["gaming", ["game", "gaming", "jeux", "console", "arcade"]],
	["recording", ["recording", "podcast", "enregistrement", "booth"]],
	["music", ["music", "musique", "guitar", "piano", "repetition"]],
	["art", ["art studio", "painting", "peinture"]],
	["photo", ["photo"]],
	["sewing", ["sewing", "couture"]],
	["meeting", ["meeting", "reunion", "conference"]],
	["study", ["study", "etude"]],
	["office", ["office", "bureau"]],
	["cellar", ["cellar", "cave", "wine"]],
	["pantry", ["pantry", "garde-manger", "cellier"]],
	[
		"storage",
		[
			"storage",
			"placard",
			"cupboard",
			"debarras",
			"grenier",
			"attic",
			"rangement",
		],
	],
	["utility", ["boiler", "chaufferie", "utility", "local technique"]],
	["server", ["server", "serveur", "network", "reseau"]],
	["pets", ["pet", "dog", "chien", "animaux"]],
	["entrance", ["entrance", "entree", "hall", "couloir", "corridor"]],
	["carport", ["carport", "car port", "abri voiture", "abri auto"]],
	["garage", ["garage"]],
	["workshop", ["workshop", "atelier"]],
	["greenhouse", ["greenhouse", "serre"]],
	["shed", ["shed", "abri", "cabanon", "remise"]],
	[
		"terrace",
		["terrace", "terrasse", "balcon", "balcony", "patio", "deck", "veranda"],
	],
	["garden", ["garden", "jardin", "yard", "pool", "piscine"]],
];

/** The icon a room's name suggests, in English or French, or `null` when it suggests none. */
export function guessRoomIcon(name: string): RoomIcon | null {
	const words = name
		.normalize("NFD")
		.replaceAll(/\p{Diacritic}/gu, "")
		.toLowerCase();
	return (
		iconKeywords.find(([, keywords]) =>
			keywords.some((keyword) => words.includes(keyword)),
		)?.[0] ?? null
	);
}

/**
 * How each room is named where its floor isn't shown next to it: its name, followed by its floor (or Outside) when
 * another room has the same name.
 */
export function roomLabels(
	rooms: HouseRoom[],
	floors: HouseFloor[],
): Map<string, string> {
	const floorNames = new Map(floors.map((floor) => [floor.id, floor.name]));
	const counts = new Map<string, number>();
	for (const room of rooms) {
		counts.set(room.name, (counts.get(room.name) ?? 0) + 1);
	}
	return new Map(
		rooms.map((room) => {
			if ((counts.get(room.name) ?? 0) < 2) {
				return [room.id, room.name];
			}
			const place = room.outdoor
				? "Outside"
				: (floorNames.get(room.floorId ?? "") ?? "no floor");
			return [room.id, `${room.name}, ${place}`];
		}),
	);
}

const exportCell = 32;
const exportTitle = 56;

function escapeXml(text: string): string {
	return text.replace(
		/[<>&"']/g,
		(character) =>
			({
				"<": "&lt;",
				">": "&gt;",
				"&": "&amp;",
				'"': "&quot;",
				"'": "&apos;",
			})[character] ?? character,
	);
}

function exportBounds(
	parts: RoomPlan[],
	pins: { x: number; y: number }[],
): { left: number; top: number; columns: number; rows: number } {
	if (parts.length === 0 && pins.length === 0) {
		return { left: 0, top: 0, columns: planSize.columns, rows: planSize.rows };
	}
	const left = Math.max(
		0,
		Math.min(
			...parts.map((part) => part.x),
			...pins.map((pin) => pin.x),
			planSize.columns,
		) - 1,
	);
	const top = Math.max(
		0,
		Math.min(
			...parts.map((part) => part.y),
			...pins.map((pin) => pin.y),
			planSize.rows,
		) - 1,
	);
	const right = Math.min(
		planSize.columns,
		Math.max(
			...parts.map((part) => part.x + part.width),
			...pins.map((pin) => pin.x),
			0,
		) + 1,
	);
	const bottom = Math.min(
		planSize.rows,
		Math.max(
			...parts.map((part) => part.y + part.height),
			...pins.map((pin) => pin.y),
			0,
		) + 1,
	);
	const columns = Math.max(right - left, 4);
	const rows = Math.max(bottom - top, 4);
	return { left, top, columns, rows };
}

function roomLabelSvg(
	room: { id: string; name: string; plan: RoomPlan[] },
	devices: { name: string; roomId: string | null }[],
	at: (x: number, y: number) => readonly [number, number],
): string[] {
	const largest = room.plan.reduce<RoomPlan | undefined>(
		(best, part) =>
			!best || part.width * part.height > best.width * best.height
				? part
				: best,
		undefined,
	);
	if (!largest) {
		return [];
	}
	const [x, y] = at(
		largest.x + largest.width / 2,
		largest.y + largest.height / 2,
	);
	const inside = devices.filter((device) => device.roomId === room.id);
	const listed = inside.slice(0, 3).map((device) => device.name);
	if (inside.length > 3) {
		listed.push(`+${inside.length - 3} more`);
	}
	const first = y - (listed.length * 14) / 2;
	return [
		`<text x="${x}" y="${first}" text-anchor="middle" font-size="14" font-weight="600" fill="#1f1f1f">${escapeXml(room.name)}</text>`,
		...listed.map(
			(name, index) =>
				`<text x="${x}" y="${first + 16 + index * 14}" text-anchor="middle" font-size="11" fill="#555555">${escapeXml(name)}</text>`,
		),
	];
}

/**
 * A floor's plan as a standalone SVG drawing, cropped to what is drawn: its rooms with their walls, names and devices,
 * the devices pinned outside rooms, and the base floor's outline dashed underneath.
 */
export function planSvg(plan: {
	title: string;
	rooms: { id: string; name: string; plan: RoomPlan[] }[];
	outline: RoomPlan[][];
	devices: {
		name: string;
		roomId: string | null;
		pin: { x: number; y: number } | null;
	}[];
}): { svg: string; width: number; height: number } {
	const { left, top, columns, rows } = exportBounds(
		[...plan.rooms.flatMap((room) => room.plan), ...plan.outline.flat()],
		plan.devices.flatMap((device) => (device.pin ? [device.pin] : [])),
	);
	const width = columns * exportCell;
	const height = rows * exportCell + exportTitle;
	const at = (x: number, y: number) =>
		[(x - left) * exportCell, (y - top) * exportCell + exportTitle] as const;
	const line = 1 / exportCell;
	const shapes = [
		...plan.outline.map(
			(base) =>
				`<path d="${planOutline(base)}" fill="none" stroke="#9a9a9a" stroke-width="${1.5 * line}" stroke-dasharray="${6 * line} ${4 * line}"/>`,
		),
		...plan.rooms.flatMap((room) =>
			room.plan.map(
				(part) =>
					`<rect x="${part.x}" y="${part.y}" width="${part.width}" height="${part.height}" fill="#f7f4f2"/>`,
			),
		),
		...plan.rooms.map(
			(room) =>
				`<path d="${planOutline(room.plan)}" fill="none" stroke="#7a7a7a" stroke-width="${1.5 * line}" stroke-linecap="square"/>`,
		),
		`<path d="${planOutline(plan.rooms.flatMap((room) => room.plan))}" fill="none" stroke="#1f1f1f" stroke-width="${5 * line}" stroke-linecap="square"/>`,
	];
	const labels = plan.rooms.flatMap((room) =>
		roomLabelSvg(room, plan.devices, at),
	);
	const pinned = plan.devices.flatMap((device) => {
		if (!device.pin) {
			return [];
		}
		const [x, y] = at(device.pin.x, device.pin.y);
		return [
			`<circle cx="${x}" cy="${y}" r="5" fill="#1f1f1f"/>`,
			`<text x="${x + 9}" y="${y + 4}" font-size="11" fill="#1f1f1f">${escapeXml(device.name)}</text>`,
		];
	});
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
		`<rect width="${width}" height="${height}" fill="#ffffff"/>`,
		`<text x="16" y="34" font-size="20" font-weight="700" fill="#1f1f1f">${escapeXml(plan.title)}</text>`,
		`<g transform="translate(${-left * exportCell} ${exportTitle - top * exportCell}) scale(${exportCell})">`,
		...shapes,
		"</g>",
		...labels,
		...pinned,
		"</svg>",
	].join("\n");
	return { svg, width, height };
}
