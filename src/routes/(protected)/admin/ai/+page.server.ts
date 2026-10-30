import Anthropic from "@anthropic-ai/sdk";
import { fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { assistant } from "#lib/server/assistant/assistant.js";
import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { secrets } from "#lib/server/core/secrets.js";
import { homes } from "#lib/server/house/homes.js";
import {
	aiVisibilitySchema,
	assistantKeySchema,
} from "#lib/server/validation/assistant.js";
import { parseForm } from "#lib/server/validation/form.js";

export const load = async ({ parent, url }) => {
	await parent();
	return {
		mcpUrl:
			authService.mcpResource(authService.publicOrigin() ?? url.origin) ?? null,
		configured: assistant.configured(),
		hidden: getSetting("aiHiddenDevices"),
	};
};

export const actions = {
	saveKey: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(assistantKeySchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await assistant.check(parsed.data.apiKey);
		} catch (failure) {
			return fail(400, {
				errors: {
					apiKey: [
						failure instanceof Anthropic.AuthenticationError
							? "The Claude API refused that key."
							: "The Claude API can't be reached to check it. Try again.",
					],
				},
			});
		}
		setSetting("assistant", {
			encryptedApiKey: secrets.encrypt(parsed.data.apiKey),
		});
		return { saved: true };
	},
	removeKey: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("assistant", null);
		return { removed: true };
	},
	visibility: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(aiVisibilitySchema, await request.formData());
		if (
			!parsed.success ||
			!DeviceDTO.find(parsed.data.deviceId, homes.current(cookies).id)
		) {
			return fail(404, { error: "That device is gone." });
		}
		const { deviceId, visible } = parsed.data;
		const others = getSetting("aiHiddenDevices").filter(
			(entry) => entry !== deviceId,
		);
		setSetting("aiHiddenDevices", visible ? others : [...others, deviceId]);
		return { visible };
	},
};
