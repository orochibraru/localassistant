import { z } from "zod";

export const mobileRedirectUri = "localassistant://auth";

const deviceLabel = z.string().trim().max(64);

export const mobileAuthorizeSchema = z.object({
	code_challenge: z.string().regex(/^[\w-]{43}$/),
	state: z.string().min(1).max(128),
	redirect_uri: z.literal(mobileRedirectUri),
	device: deviceLabel.default(""),
});

export const mobileTokenSchema = z.object({
	code: z.string().trim().min(16).max(256),
	codeVerifier: z
		.string()
		.regex(/^[\w.~-]{43,128}$/)
		.optional(),
	device: deviceLabel.default(""),
});

export const mobileDeviceSchema = z.object({
	installationId: z.uuid(),
	name: z.string().trim().min(1, "Name the device.").max(60),
});

export const routineEnabledSchema = z.object({ enabled: z.boolean() });

export const mobilePushSchema = z.object({
	endpoint: z.url({ protocol: /^https?$/ }).max(1000),
	p256dh: z.string().regex(/^[\w-]{80,120}$/),
	auth: z.string().regex(/^[\w-]{16,40}$/),
	device: z.string().trim().min(1).max(80),
});

export const mobilePushEndpointSchema = z.object({
	endpoint: z.string().min(1).max(1000),
});
