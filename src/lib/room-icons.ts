import ArmchairIcon from "@lucide/svelte/icons/armchair";
import BabyIcon from "@lucide/svelte/icons/baby";
import BathIcon from "@lucide/svelte/icons/bath";
import BedDoubleIcon from "@lucide/svelte/icons/bed-double";
import BedSingleIcon from "@lucide/svelte/icons/bed-single";
import BookOpenIcon from "@lucide/svelte/icons/book-open";
import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
import CameraIcon from "@lucide/svelte/icons/camera";
import CarIcon from "@lucide/svelte/icons/car";
import CarFrontIcon from "@lucide/svelte/icons/car-front";
import ClapperboardIcon from "@lucide/svelte/icons/clapperboard";
import CookingPotIcon from "@lucide/svelte/icons/cooking-pot";
import DoorClosedIcon from "@lucide/svelte/icons/door-closed";
import DoorOpenIcon from "@lucide/svelte/icons/door-open";
import DoorStairwellIcon from "@lucide/svelte/icons/door-stairwell";
import DumbbellIcon from "@lucide/svelte/icons/dumbbell";
import FlameIcon from "@lucide/svelte/icons/flame";
import Gamepad2Icon from "@lucide/svelte/icons/gamepad-2";
import GuitarIcon from "@lucide/svelte/icons/guitar";
import HammerIcon from "@lucide/svelte/icons/hammer";
import LaptopIcon from "@lucide/svelte/icons/laptop";
import MicVocalIcon from "@lucide/svelte/icons/mic-vocal";
import PackageIcon from "@lucide/svelte/icons/package";
import PaletteIcon from "@lucide/svelte/icons/palette";
import PawPrintIcon from "@lucide/svelte/icons/paw-print";
import PresentationIcon from "@lucide/svelte/icons/presentation";
import RefrigeratorIcon from "@lucide/svelte/icons/refrigerator";
import ScissorsIcon from "@lucide/svelte/icons/scissors";
import ServerIcon from "@lucide/svelte/icons/server";
import ShirtIcon from "@lucide/svelte/icons/shirt";
import SofaIcon from "@lucide/svelte/icons/sofa";
import SproutIcon from "@lucide/svelte/icons/sprout";
import SunIcon from "@lucide/svelte/icons/sun";
import ToyBrickIcon from "@lucide/svelte/icons/toy-brick";
import TreesIcon from "@lucide/svelte/icons/trees";
import TvIcon from "@lucide/svelte/icons/tv";
import UtensilsCrossedIcon from "@lucide/svelte/icons/utensils-crossed";
import WarehouseIcon from "@lucide/svelte/icons/warehouse";
import WashingMachineIcon from "@lucide/svelte/icons/washing-machine";
import WineIcon from "@lucide/svelte/icons/wine";
import type { Component } from "svelte";

import type { RoomIcon } from "#lib/house.js";

const icons: Record<RoomIcon, Component<{ class?: string }>> = {
	door: DoorOpenIcon,
	entrance: DoorClosedIcon,
	stairs: DoorStairwellIcon,
	living: SofaIcon,
	lounge: ArmchairIcon,
	dining: UtensilsCrossedIcon,
	kitchen: CookingPotIcon,
	pantry: RefrigeratorIcon,
	bedroom: BedDoubleIcon,
	guest: BedSingleIcon,
	kids: BabyIcon,
	playroom: ToyBrickIcon,
	bathroom: BathIcon,
	dressing: ShirtIcon,
	laundry: WashingMachineIcon,
	office: LaptopIcon,
	study: BriefcaseIcon,
	meeting: PresentationIcon,
	library: BookOpenIcon,
	music: GuitarIcon,
	recording: MicVocalIcon,
	art: PaletteIcon,
	photo: CameraIcon,
	sewing: ScissorsIcon,
	cinema: ClapperboardIcon,
	tv: TvIcon,
	gaming: Gamepad2Icon,
	gym: DumbbellIcon,
	cellar: WineIcon,
	storage: PackageIcon,
	utility: FlameIcon,
	server: ServerIcon,
	pets: PawPrintIcon,
	garage: CarIcon,
	carport: CarFrontIcon,
	shed: WarehouseIcon,
	workshop: HammerIcon,
	greenhouse: SproutIcon,
	terrace: SunIcon,
	garden: TreesIcon,
};

/** The icon a room shows, the plain door for an unknown one. */
export function roomIcon(key: string): Component<{ class?: string }> {
	return icons[key as RoomIcon] ?? DoorOpenIcon;
}
