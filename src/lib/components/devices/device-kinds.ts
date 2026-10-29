import BlindsIcon from "@lucide/svelte/icons/blinds";
import BotIcon from "@lucide/svelte/icons/bot";
import CctvIcon from "@lucide/svelte/icons/cctv";
import DoorOpenIcon from "@lucide/svelte/icons/door-open";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import HeaterIcon from "@lucide/svelte/icons/heater";
import PlugIcon from "@lucide/svelte/icons/plug";
import PrinterIcon from "@lucide/svelte/icons/printer";
import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
import ThermometerIcon from "@lucide/svelte/icons/thermometer";
import type { Component } from "svelte";

import type { DeviceKind } from "#lib/dto/device.js";

export const deviceKindLabels: Record<DeviceKind, string> = {
	"tuya-cover": "Tuya blind",
	"melcloud-ata": "Air-to-air heat pump",
	"melcloud-atw": "Air-to-water heat pump",
	"bambu-printer": "Bambu Lab printer",
	app: "Phone or tablet",
	"dreame-vacuum": "Dreame robot vacuum",
	"zigbee-contact": "Door or window sensor",
	"zigbee-valve": "Radiator valve",
	"zigbee-switch": "Relay or plug",
	"zigbee-meter": "Energy meter",
	"shelly-meter": "Shelly meter",
	linky: "Linky (Enedis online)",
	camera: "Camera",
	"frigate-camera": "Frigate camera",
	"esphome-climate": "Mitsubishi (ESPHome)",
};

export const deviceKindIcons: Record<
	DeviceKind,
	Component<{ class?: string }>
> = {
	"tuya-cover": BlindsIcon,
	"melcloud-ata": ThermometerIcon,
	"melcloud-atw": ThermometerIcon,
	"bambu-printer": PrinterIcon,
	app: SmartphoneIcon,
	"dreame-vacuum": BotIcon,
	"zigbee-contact": DoorOpenIcon,
	"zigbee-valve": HeaterIcon,
	"zigbee-switch": PlugIcon,
	"zigbee-meter": GaugeIcon,
	"shelly-meter": GaugeIcon,
	linky: GaugeIcon,
	camera: CctvIcon,
	"frigate-camera": CctvIcon,
	"esphome-climate": ThermometerIcon,
};
