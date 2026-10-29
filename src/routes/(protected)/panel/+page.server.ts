import { DeviceDTO } from "#lib/dto/device.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return {
		devices: DeviceDTO.inHome(home.id).map((device) => device.toJSON()),
	};
};
