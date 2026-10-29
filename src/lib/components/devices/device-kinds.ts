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
import type { AddDeviceSheet } from "#lib/sheets.svelte.js";

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

export const addDeviceOptions: {
	sheet: AddDeviceSheet;
	title: string;
	description: string;
	icon: Component<{ class?: string }>;
}[] = [
	{
		sheet: "melcloud",
		title: "Mitsubishi (MELCloud)",
		description: "Every heat pump on your MELCloud account.",
		icon: ThermometerIcon,
	},
	{
		sheet: "esphome",
		title: "Mitsubishi through ESPHome",
		description: "A CN105 board on the unit, local and cloud-free.",
		icon: ThermometerIcon,
	},
	{
		sheet: "zigbee",
		title: "Zigbee and Shelly",
		description:
			"Sensors, radiator valves, relays and meters over one MQTT broker.",
		icon: DoorOpenIcon,
	},
	{
		sheet: "blind",
		title: "Tuya blind",
		description: "Driven over your network with its local key.",
		icon: BlindsIcon,
	},
	{
		sheet: "camera",
		title: "Camera",
		description: "Any RTSP camera, watched and recorded by this server.",
		icon: CctvIcon,
	},
	{
		sheet: "frigate",
		title: "Frigate",
		description: "Its cameras, events, clips and detection alerts.",
		icon: CctvIcon,
	},
	{
		sheet: "printer",
		title: "Bambu Lab printer",
		description: "Progress, light and camera over your network.",
		icon: PrinterIcon,
	},
	{
		sheet: "dreame",
		title: "Dreame robot vacuums",
		description: "Every robot on your Dreamehome account.",
		icon: BotIcon,
	},
	{
		sheet: "linky",
		title: "Linky online",
		description:
			"The whole house's daily use, whoever your supplier is, no hardware.",
		icon: GaugeIcon,
	},
];
