import { DeviceDTO } from "#lib/dto/device.js";

export const load = async ({ parent }) => {
	await parent();
	return {
		devices: DeviceDTO.all().map((device) => device.toJSON()),
	};
};
