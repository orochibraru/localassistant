import BlindsIcon from "@lucide/svelte/icons/blinds";
import BotIcon from "@lucide/svelte/icons/bot";
import CctvIcon from "@lucide/svelte/icons/cctv";
import DoorOpenIcon from "@lucide/svelte/icons/door-open";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import HeaterIcon from "@lucide/svelte/icons/heater";
import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
import LockIcon from "@lucide/svelte/icons/lock";
import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";
import PlugIcon from "@lucide/svelte/icons/plug";
import PrinterIcon from "@lucide/svelte/icons/printer";
import PuzzleIcon from "@lucide/svelte/icons/puzzle";
import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
import SpeakerIcon from "@lucide/svelte/icons/speaker";
import ThermometerIcon from "@lucide/svelte/icons/thermometer";
import TvIcon from "@lucide/svelte/icons/tv";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import { type KindCatalog, kindInfo, type PluginIcon } from "#lib/plugins.js";

export const pluginIconComponents: Record<
	PluginIcon,
	Component<{ class?: string }>
> = {
	blinds: BlindsIcon,
	bot: BotIcon,
	cctv: CctvIcon,
	"door-open": DoorOpenIcon,
	droplets: DropletsIcon,
	fan: FanIcon,
	gauge: GaugeIcon,
	heater: HeaterIcon,
	lightbulb: LightbulbIcon,
	lock: LockIcon,
	"mouse-pointer-click": MousePointerClickIcon,
	plug: PlugIcon,
	printer: PrinterIcon,
	puzzle: PuzzleIcon,
	smartphone: SmartphoneIcon,
	speaker: SpeakerIcon,
	thermometer: ThermometerIcon,
	tv: TvIcon,
	zap: ZapIcon,
};

/** The icon a device of `kind` shows, from the plugin that provides it. */
export function kindIcon(
	catalog: KindCatalog | undefined,
	kind: string,
): Component<{ class?: string }> {
	return pluginIconComponents[kindInfo(catalog, kind).icon];
}
