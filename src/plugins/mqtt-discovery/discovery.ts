import type { ClimateMode } from "#lib/devices.js";

export type DiscoveryConfig = Record<string, unknown>;

export type Role =
	| "switch"
	| "cover-state"
	| "cover-position"
	| "contact"
	| "power"
	| "energy"
	| "climate-mode"
	| "climate-target"
	| "climate-current";

export interface Subscription {
	topic: string;
	role: Role;
	template: string | null;
}

export interface DiscoveredEntity {
	kind: string;
	externalId: string;
	name: string;
	config: DiscoveryConfig;
}

const abbreviations: Record<string, string> = {
	avty_t: "availability_topic",
	cmd_t: "command_topic",
	curr_temp_t: "current_temperature_topic",
	curr_temp_tpl: "current_temperature_template",
	dev: "device",
	dev_cla: "device_class",
	max_temp: "max_temp",
	min_temp: "min_temp",
	mode_cmd_t: "mode_command_topic",
	mode_stat_t: "mode_state_topic",
	mode_stat_tpl: "mode_state_template",
	obj_id: "object_id",
	pl_cls: "payload_close",
	pl_off: "payload_off",
	pl_on: "payload_on",
	pl_open: "payload_open",
	pl_stop: "payload_stop",
	pos_clsd: "position_closed",
	pos_open: "position_open",
	pos_t: "position_topic",
	pos_tpl: "position_template",
	set_pos_t: "set_position_topic",
	stat_clsd: "state_closed",
	stat_off: "state_off",
	stat_on: "state_on",
	stat_open: "state_open",
	stat_t: "state_topic",
	stat_val_tpl: "state_value_template",
	temp_cmd_t: "temperature_command_topic",
	temp_stat_t: "temperature_state_topic",
	temp_stat_tpl: "temperature_state_template",
	uniq_id: "unique_id",
	unit_of_meas: "unit_of_measurement",
	val_tpl: "value_template",
};

const contactClasses = new Set(["door", "window", "opening", "garage_door"]);

const climateModes: Record<string, ClimateMode> = {
	heat: "heat",
	cool: "cool",
	dry: "dry",
	fan_only: "fan",
	auto: "auto",
	heat_cool: "auto",
};

/** Home Assistant's MQTT discovery format, read without Home Assistant: abbreviations, base topics and simple templates. */
class Discovery {
	/** `raw` with its abbreviated keys spelled out and every `~` in a topic replaced by its base topic. */
	normalize(raw: DiscoveryConfig): DiscoveryConfig {
		const config: DiscoveryConfig = {};
		for (const [key, value] of Object.entries(raw)) {
			config[abbreviations[key] ?? key] = value;
		}
		const base = typeof config["~"] === "string" ? config["~"] : null;
		if (base) {
			for (const [key, value] of Object.entries(config)) {
				if (key.endsWith("_topic") && typeof value === "string") {
					config[key] = value.startsWith("~")
						? `${base}${value.slice(1)}`
						: value.endsWith("~")
							? `${value.slice(0, -1)}${base}`
							: value;
				}
			}
		}
		return config;
	}

	/**
	 * The device a discovery message announces, or `null` for one LocalAssistant can't show: switches and lights,
	 * covers, door and window sensors, power and energy sensors, and thermostats.
	 */
	entity(
		component: string,
		objectPath: string,
		raw: DiscoveryConfig,
	): DiscoveredEntity | null {
		const config = this.normalize(raw);
		const kind = this.#kind(component, config);
		if (!kind) {
			return null;
		}
		const device = (config.device ?? {}) as { name?: unknown };
		const deviceName = typeof device.name === "string" ? device.name : null;
		const ownName = typeof config.name === "string" ? config.name : null;
		const name =
			[deviceName, ownName].filter(Boolean).join(" ") ||
			objectPath.replaceAll("/", " ");
		return {
			kind,
			externalId:
				typeof config.unique_id === "string" && config.unique_id
					? config.unique_id
					: `${component}/${objectPath}`,
			name,
			config,
		};
	}

	/** The topics a device's state comes from, each with the part of the state it carries. */
	subscriptions(kind: string, config: DiscoveryConfig): Subscription[] {
		const topic = (key: string) =>
			typeof config[key] === "string" ? (config[key] as string) : null;
		const template = (key: string) =>
			typeof config[key] === "string" ? (config[key] as string) : null;
		const value = template("value_template");
		const switchTemplate =
			template("state_value_template") ??
			value ??
			(config.schema === "json" ? "{{ value_json.state }}" : null);
		const entries: [string | null, Role, string | null][] =
			({
				"mqtt-discovery-switch": [
					[topic("state_topic"), "switch", switchTemplate],
				],
				"mqtt-discovery-contact": [[topic("state_topic"), "contact", value]],
				"mqtt-discovery-power": [[topic("state_topic"), "power", value]],
				"mqtt-discovery-energy": [[topic("state_topic"), "energy", value]],
				"mqtt-discovery-cover": [
					[topic("state_topic"), "cover-state", value],
					[
						topic("position_topic"),
						"cover-position",
						template("position_template"),
					],
				],
				"mqtt-discovery-climate": [
					[
						topic("mode_state_topic"),
						"climate-mode",
						template("mode_state_template"),
					],
					[
						topic("temperature_state_topic"),
						"climate-target",
						template("temperature_state_template"),
					],
					[
						topic("current_temperature_topic"),
						"climate-current",
						template("current_temperature_template"),
					],
				],
			}[kind] as [string | null, Role, string | null][] | undefined) ?? [];
		return entries.flatMap(([address, role, rendering]) =>
			address ? [{ topic: address, role, template: rendering }] : [],
		);
	}

	/**
	 * The value a template picks from a message: `{{ value }}`, `{{ value_json.a.b }}` or `{{ value_json['a'] }}`,
	 * filters after `|` left out; `undefined` for anything else.
	 */
	render(template: string | null, payload: string): unknown {
		if (!template) {
			return payload;
		}
		const match =
			/^\s*\{\{\s*(value(?:_json(?:\s*(?:\.[\w-]+|\[\s*['"][^'"]+['"]\s*\]|\[\d+\]))*)?)\s*(?:\|[^}]*)?\}\}\s*$/.exec(
				template,
			);
		if (!match?.[1]) {
			return undefined;
		}
		if (match[1] === "value") {
			return payload;
		}
		let current: unknown;
		try {
			current = JSON.parse(payload);
		} catch {
			return undefined;
		}
		const path = match[1].slice("value_json".length);
		for (const part of path.matchAll(
			/\.([\w-]+)|\[\s*['"]([^'"]+)['"]\s*\]|\[(\d+)\]/g,
		)) {
			const key = part[1] ?? part[2] ?? part[3] ?? "";
			if (current === null || typeof current !== "object") {
				return undefined;
			}
			current = (current as Record<string, unknown>)[key];
		}
		return current;
	}

	/** A climate mode in LocalAssistant's words, or `null` for off or one it doesn't know. */
	climateMode(mode: string): ClimateMode | null {
		return climateModes[mode] ?? null;
	}

	/** Home Assistant's mode for a LocalAssistant one, among the ones the thermostat lists. */
	haMode(mode: ClimateMode, modes: string[]): string {
		return (
			modes.find((entry) => climateModes[entry] === mode) ??
			(mode === "fan" ? "fan_only" : mode)
		);
	}

	#kind(component: string, config: DiscoveryConfig): string | null {
		const deviceClass =
			typeof config.device_class === "string" ? config.device_class : "";
		const unit =
			typeof config.unit_of_measurement === "string"
				? config.unit_of_measurement
				: "";
		if (
			(component === "switch" || component === "light") &&
			config.command_topic
		) {
			return "mqtt-discovery-switch";
		}
		if (
			component === "cover" &&
			(config.command_topic || config.set_position_topic)
		) {
			return "mqtt-discovery-cover";
		}
		if (component === "binary_sensor" && contactClasses.has(deviceClass)) {
			return "mqtt-discovery-contact";
		}
		if (
			component === "sensor" &&
			(deviceClass === "power" || unit === "W" || unit === "kW")
		) {
			return "mqtt-discovery-power";
		}
		if (
			component === "sensor" &&
			(deviceClass === "energy" || unit === "kWh" || unit === "Wh")
		) {
			return "mqtt-discovery-energy";
		}
		return component === "climate" ? "mqtt-discovery-climate" : null;
	}
}

export const discovery = new Discovery();
