import { access } from "#lib/server/auth/access.js";

export const load = ({ locals, url }) => {
	if (!locals.user) {
		access.redirectToSignIn(url);
	}
	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
		},
		isAdmin: access.isAdmin(locals.user),
	};
};
