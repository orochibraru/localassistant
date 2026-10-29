import { deviceName } from "#lib/device-name.js";
import type { AppReport } from "#lib/devices.js";

const storageKey = "localassistant-app-device";

export interface StoredAppDevice {
	id: string;
	shareLocation: boolean;
}

interface BatteryManager {
	level: number;
	charging: boolean;
}

/** The phone or tablet device this browser registered as, if any. */
export function storedAppDevice(): StoredAppDevice | null {
	try {
		const value: unknown = JSON.parse(
			localStorage.getItem(storageKey) ?? "null",
		);
		return value && typeof value === "object" && "id" in value
			? (value as StoredAppDevice)
			: null;
	} catch {
		return null;
	}
}

/** Remembers in this browser which device it is, or forgets it when `device` is `null`. */
export function rememberAppDevice(device: StoredAppDevice | null): void {
	try {
		if (device) {
			localStorage.setItem(storageKey, JSON.stringify(device));
		} else {
			localStorage.removeItem(storageKey);
		}
	} catch {
		return;
	}
}

/** Where this browser is, asking for permission the first time; `null` when refused or too slow. */
export function currentLocation(): Promise<AppReport["location"]> {
	return new Promise((resolve) => {
		if (!("geolocation" in navigator)) {
			resolve(null);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) =>
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: Math.round(position.coords.accuracy),
				}),
			(failure) =>
				resolve(failure.code === failure.PERMISSION_DENIED ? null : undefined),
			{ timeout: 15_000, maximumAge: 60_000 },
		);
	});
}

/** The battery, charging state, platform and, when shared, location of this browser right now. */
export async function readAppReport(
	shareLocation: boolean,
): Promise<AppReport> {
	const reader = (
		navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
	).getBattery;
	const battery = reader
		? await reader.call(navigator).catch(() => null)
		: null;
	return {
		battery: battery ? Math.round(battery.level * 100) : null,
		charging: battery ? battery.charging : null,
		platform: deviceName(navigator.userAgent),
		location: shareLocation ? await currentLocation() : null,
	};
}
