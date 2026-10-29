import { DeviceDTO } from "#lib/dto/device.js";
import type { SceneDTO } from "#lib/dto/scene.js";
import { Logger } from "#lib/server/core/logger.js";
import { devices } from "#lib/server/devices/devices.js";

const logger = new Logger("Scenes");

/** Puts devices the way a scene says, one after the other. */
class Scenes {
	/** Sends every member of `scene` its command and returns what failed, one line per device; never throws. */
	async activate(scene: SceneDTO): Promise<string[]> {
		const failures: string[] = [];
		for (const member of scene.members) {
			const device = DeviceDTO.find(member.deviceId, scene.homeId);
			if (!device) {
				failures.push("A device in the scene is gone.");
				continue;
			}
			try {
				await devices.command(device, member.command);
			} catch (error) {
				failures.push(`${device.toJSON().name}: ${devices.message(error)}`);
			}
		}
		logger.info("Scene set", { scene: scene.id, failures: failures.length });
		return failures;
	}
}

export const scenes = new Scenes();
