import type { Plugin } from "#lib/plugin-sdk.js";
import bambu from "#plugins/bambu/index.js";
import bambuManifest from "#plugins/bambu/localassistant-plugin.json";
import camera from "#plugins/camera/index.js";
import cameraManifest from "#plugins/camera/localassistant-plugin.json";
import dreame from "#plugins/dreame/index.js";
import dreameManifest from "#plugins/dreame/localassistant-plugin.json";
import esphome from "#plugins/esphome/index.js";
import esphomeManifest from "#plugins/esphome/localassistant-plugin.json";
import frigate from "#plugins/frigate/index.js";
import frigateManifest from "#plugins/frigate/localassistant-plugin.json";
import linky from "#plugins/linky/index.js";
import linkyManifest from "#plugins/linky/localassistant-plugin.json";
import melcloud from "#plugins/melcloud/index.js";
import melcloudManifest from "#plugins/melcloud/localassistant-plugin.json";
import mqttDiscovery from "#plugins/mqtt-discovery/index.js";
import mqttDiscoveryManifest from "#plugins/mqtt-discovery/localassistant-plugin.json";
import shelly from "#plugins/shelly/index.js";
import shellyManifest from "#plugins/shelly/localassistant-plugin.json";
import tuya from "#plugins/tuya/index.js";
import tuyaManifest from "#plugins/tuya/localassistant-plugin.json";
import zigbee from "#plugins/zigbee/index.js";
import zigbeeManifest from "#plugins/zigbee/localassistant-plugin.json";

export const officialPlugins: { manifest: unknown; plugin: Plugin }[] = [
	{ manifest: tuyaManifest, plugin: tuya },
	{ manifest: melcloudManifest, plugin: melcloud },
	{ manifest: esphomeManifest, plugin: esphome },
	{ manifest: zigbeeManifest, plugin: zigbee },
	{ manifest: shellyManifest, plugin: shelly },
	{ manifest: cameraManifest, plugin: camera },
	{ manifest: frigateManifest, plugin: frigate },
	{ manifest: bambuManifest, plugin: bambu },
	{ manifest: dreameManifest, plugin: dreame },
	{ manifest: linkyManifest, plugin: linky },
	{ manifest: mqttDiscoveryManifest, plugin: mqttDiscovery },
];
