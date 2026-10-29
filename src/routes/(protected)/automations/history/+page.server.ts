import { AutomationRunDTO } from "#lib/dto/automation-run.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return { runs: AutomationRunDTO.recentInHome(home.id) };
};
