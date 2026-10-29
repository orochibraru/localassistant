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
