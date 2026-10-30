import { error, json } from "@sveltejs/kit";

import { AutomationRunDTO } from "#lib/dto/automation-run.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { access } from "#lib/server/auth/access.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { routineEnabledSchema } from "#lib/server/validation/mobile.js";

export const PATCH = async ({ params, request }) => {
	access.requireUser();
	const { enabled } = await mobileApi.body(request, routineEnabledSchema);
	const automation = AutomationDTO.find(params.routineId);
	if (!automation) {
		error(404, "That routine is gone.");
	}
	if (!enabled) {
		AutomationRunDTO.cancelWaiting(automation.id);
	}
	automation.setEnabled(enabled);
	return json({ enabled });
};
