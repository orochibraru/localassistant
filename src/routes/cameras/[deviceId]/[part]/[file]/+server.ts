import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { cameras } from "#lib/server/devices/cameras.js";
import { fileResponse } from "#lib/server/http/file-response.js";

export const GET = ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, "Sign in again to continue.");
	}
	const part =
		params.part === "live" || params.part === "recordings" ? params.part : null;
	const path = part ? cameras.file(params.deviceId, part, params.file) : null;
	if (!path || DeviceDTO.find(params.deviceId)?.kind !== "camera") {
		error(404, "Not found");
	}
	return fileResponse(
		Bun.file(path),
		request,
		part === "live" ? "no-store" : "private, max-age=3600",
	);
};
