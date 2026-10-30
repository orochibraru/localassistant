import { error } from "@sveltejs/kit";

import { AutomationDTO } from "#lib/dto/automation.js";
import { JobDTO } from "#lib/dto/job.js";
import { access } from "#lib/server/auth/access.js";

export const POST = ({ params }) => {
	access.requireUser();
	const automation = AutomationDTO.find(params.routineId);
	if (!automation) {
		error(404, "That routine is gone.");
	}
	JobDTO.enqueue(
		"automation.run",
		{ automationId: automation.id },
		{ maxAttempts: 1 },
	);
	return new Response(null, { status: 202 });
};
