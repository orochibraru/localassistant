export const roomIconLabels = {
	door: "Room",
	entrance: "Entrance",
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
