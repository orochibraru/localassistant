import type { HandleClientError } from "@sveltejs/kit/hooks";

export const handleError: HandleClientError = ({ error, kind }) => {
	if (kind !== "unknown") {
		return;
	}
	const errorId = crypto.randomUUID();
	// eslint-disable-next-line no-console -- the server Logger is not available in the browser
	console.error(errorId, error);
	return { errorId, message: "Something went wrong." };
};
