import { DeviceDTO } from "#lib/dto/device.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return {
		devices: DeviceDTO.inHome(home.id).map((device) => {
			const { id, name, kind, roomId, options } = device.toJSON();
			return { id, name, kind, roomId, pin: options?.pin ?? null };
		}),
	};
};
