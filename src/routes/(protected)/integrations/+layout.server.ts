import { error } from "@sveltejs/kit";

export const load = async ({ parent }) => {
	const { isAdmin } = await parent();
	if (!isAdmin) {
		error(404, "Not found");
	}
};
