import { DeviceDTO } from "#lib/dto/device.js";

export const load = async ({ parent }) => {
	await parent();
	return {
		devices: DeviceDTO.all().map((device) => {
			const { id, kind, name, state, stateError, stateAt } = device.toJSON();
			return { id, kind, name, state, stateError, stateAt };
		}),
	};
};
