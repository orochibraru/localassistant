import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { cardSizes } from "#lib/devices.js";
import type { RoomPlan } from "#lib/house.js";

const createdAt = () =>
	integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
		.$onUpdate(() => new Date());

export const userRoles = ["admin", "member"] as const;

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.notNull()
		.default(false),
	image: text("image"),
	twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(
		false,
	),
	role: text("role", { enum: userRoles }).notNull().default("member"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp_ms",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp_ms",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const jobStatuses = ["pending", "running", "done", "failed"] as const;

export const job = sqliteTable(
	"job",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		type: text("type").notNull(),
		payload: text("payload", { mode: "json" }).notNull(),
		status: text("status", { enum: jobStatuses }).notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(5),
		runAt: integer("run_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
		finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
		lastError: text("last_error"),
		createdAt: createdAt(),
	},
	(table) => [index("job_status_run_at_idx").on(table.status, table.runAt)],
);

export const twoFactor = sqliteTable(
	"two_factor",
	{
		id: text("id").primaryKey(),
		secret: text("secret").notNull(),
		backupCodes: text("backup_codes").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		verified: integer("verified", { mode: "boolean" }).default(true),
		failedVerificationCount: integer("failed_verification_count").default(0),
		lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("two_factor_user_id_idx").on(table.userId),
		index("two_factor_secret_idx").on(table.secret),
	],
);

export const passkey = sqliteTable(
	"passkey",
	{
		id: text("id").primaryKey(),
		name: text("name"),
		publicKey: text("public_key").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("device_type").notNull(),
		backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
		transports: text("transports"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		aaguid: text("aaguid"),
	},
	(table) => [
		index("passkey_user_id_idx").on(table.userId),
		index("passkey_credential_id_idx").on(table.credentialID),
	],
);

export const setting = sqliteTable("setting", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }).notNull(),
	updatedAt: updatedAt(),
});

export const invite = sqliteTable(
	"invite",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		email: text("email").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		invitedBy: text("invited_by").references(() => user.id, {
			onDelete: "set null",
		}),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
	},
	(table) => [index("invite_email_idx").on(table.email)],
);

export const accents = [
	"bordeaux",
	"green",
	"blue",
	"violet",
	"rose",
	"orange",
	"amber",
	"cyan",
	"neutral",
] as const;
export const themes = ["system", "light", "dark"] as const;
export const darkVariants = ["default", "amoled"] as const;
export const fonts = ["default", "system", "serif", "mono"] as const;
export const cornerStyles = ["rounded", "square"] as const;

export const appearance = sqliteTable("appearance", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	accent: text("accent", { enum: accents }).notNull().default("bordeaux"),
	theme: text("theme", { enum: themes }).notNull().default("system"),
	darkVariant: text("dark_variant", { enum: darkVariants })
		.notNull()
		.default("default"),
	font: text("font", { enum: fonts }).notNull().default("default"),
	corners: text("corners", { enum: cornerStyles }).notNull().default("rounded"),
	updatedAt: updatedAt(),
});

export const pushSubscription = sqliteTable(
	"push_subscription",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		endpoint: text("endpoint").notNull(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		device: text("device").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("push_subscription_endpoint_idx").on(table.endpoint),
		index("push_subscription_user_id_idx").on(table.userId),
	],
);

export const home = sqliteTable("home", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text("name").notNull(),
	place: text("place"),
	latitude: real("latitude"),
	longitude: real("longitude"),
	timezone: text("timezone"),
	weather: text("weather", { mode: "json" }),
	weatherAt: integer("weather_at", { mode: "timestamp_ms" }),
	planBaseFloorId: text("plan_base_floor_id"),
	createdAt: createdAt(),
});

export const floor = sqliteTable("floor", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	homeId: text("home_id").references(() => home.id),
	name: text("name").notNull(),
	level: integer("level").notNull().default(0),
	createdAt: createdAt(),
});

export const room = sqliteTable("room", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	homeId: text("home_id").references(() => home.id),
	name: text("name").notNull(),
	icon: text("icon").notNull().default("door"),
	floorId: text("floor_id").references(() => floor.id, {
		onDelete: "set null",
	}),
	outdoor: integer("outdoor", { mode: "boolean" }).notNull().default(false),
	plan: text("plan", { mode: "json" }).$type<RoomPlan[]>(),
	createdAt: createdAt(),
});

export const device = sqliteTable(
	"device",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kind: text("kind").notNull(),
		homeId: text("home_id").references(() => home.id),
		ownerId: text("owner_id"),
		options: text("options", { mode: "json" }),
		fields: text("fields", { mode: "json" }),
		secrets: text("secrets", { mode: "json" }),
		name: text("name").notNull(),
		roomId: text("room_id").references(() => room.id, { onDelete: "set null" }),
		externalId: text("external_id").notNull(),
		host: text("host"),
		state: text("state", { mode: "json" }),
		stateError: text("state_error"),
		stateAt: integer("state_at", { mode: "timestamp_ms" }),
		unreachableSince: integer("unreachable_since", { mode: "timestamp_ms" }),
		unreachableAlerted: integer("unreachable_alerted", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("device_kind_external_id_idx").on(table.kind, table.externalId),
	],
);

export const plugin = sqliteTable("plugin", {
	id: text("id").primaryKey(),
	repository: text("repository").notNull(),
	path: text("path").notNull().default(""),
	ref: text("ref").notNull(),
	manifest: text("manifest", { mode: "json" }).notNull(),
	status: text("status", { mode: "json" }),
	installedAt: createdAt(),
	updatedAt: updatedAt(),
});

export const energyReading = sqliteTable(
	"energy_reading",
	{
		deviceId: text("device_id")
			.notNull()
			.references(() => device.id, { onDelete: "cascade" }),
		hour: integer("hour", { mode: "timestamp_ms" }).notNull(),
		total: real("total").notNull(),
	},
	(table) => [primaryKey({ columns: [table.deviceId, table.hour] })],
);

export const cardLayout = sqliteTable("card_layout", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	order: text("order", { mode: "json" }).$type<string[]>().notNull(),
	brief: text("brief", { mode: "json" }).$type<string[]>().notNull(),
});

export const cardSize = sqliteTable(
	"card_size",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		deviceId: text("device_id")
			.notNull()
			.references(() => device.id, { onDelete: "cascade" }),
		size: text("size", { enum: cardSizes }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.deviceId] })],
);

export const automation = sqliteTable("automation", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	homeId: text("home_id")
		.notNull()
		.references(() => home.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	trigger: text("trigger", { mode: "json" }).notNull(),
	period: text("period", { mode: "json" }).notNull(),
	conditions: text("conditions", { mode: "json" }).notNull().default([]),
	actions: text("actions", { mode: "json" }).notNull(),
	memory: text("memory", { mode: "json" }),
	checkedAt: integer("checked_at", { mode: "timestamp_ms" }),
	ranAt: integer("ran_at", { mode: "timestamp_ms" }),
	runError: text("run_error"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const automationRun = sqliteTable(
	"automation_run",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		automationId: text("automation_id")
			.notNull()
			.references(() => automation.id, { onDelete: "cascade" }),
		cause: text("cause").notNull(),
		status: text("status").notNull(),
		error: text("error"),
		startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
		finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("automation_run_automation_idx").on(
			table.automationId,
			table.startedAt,
		),
	],
);

export const deviceSample = sqliteTable(
	"device_sample",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		deviceId: text("device_id")
			.notNull()
			.references(() => device.id, { onDelete: "cascade" }),
		at: integer("at", { mode: "timestamp_ms" }).notNull(),
		value: real("value").notNull(),
	},
	(table) => [index("device_sample_device_idx").on(table.deviceId, table.at)],
);

export const logbookEntry = sqliteTable(
	"logbook_entry",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		homeId: text("home_id").references(() => home.id, {
			onDelete: "cascade",
		}),
		deviceId: text("device_id"),
		name: text("name").notNull(),
		message: text("message").notNull(),
		at: integer("at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("logbook_entry_at_idx").on(table.at),
		index("logbook_entry_device_idx").on(table.deviceId, table.at),
	],
);

export const presence = sqliteTable("presence", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	home: integer("home", { mode: "boolean" }),
	changedAt: integer("changed_at", { mode: "timestamp_ms" }).notNull(),
});

export const scene = sqliteTable("scene", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	homeId: text("home_id")
		.notNull()
		.references(() => home.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	members: text("members", { mode: "json" }).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const jwks = sqliteTable("jwks", {
	id: text("id").primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
	alg: text("alg"),
	crv: text("crv"),
});

export const oauthClient = sqliteTable(
	"oauth_client",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		clientDiscoveryId: text("client_discovery_id"),
		disabled: integer("disabled", { mode: "boolean" }).default(false),
		skipConsent: integer("skip_consent", { mode: "boolean" }),
		enableEndSession: integer("enable_end_session", { mode: "boolean" }),
		subjectType: text("subject_type"),
		scopes: text("scopes"),
		clientCredentialsScopes: text("client_credentials_scopes"),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts"),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: text("redirect_uris").notNull(),
		postLogoutRedirectUris: text("post_logout_redirect_uris"),
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: integer(
			"backchannel_logout_session_required",
			{ mode: "boolean" },
		),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		jwks: text("jwks"),
		jwksUri: text("jwks_uri"),
		grantTypes: text("grant_types"),
		responseTypes: text("response_types"),
		requirePKCE: integer("require_pkce", { mode: "boolean" }),
		dpopBoundAccessTokens: integer("dpop_bound_access_tokens", {
			mode: "boolean",
		}).default(false),
		referenceId: text("reference_id"),
		metadata: text("metadata"),
	},
	(table) => [index("oauth_client_user_id_idx").on(table.userId)],
);

export const oauthResource = sqliteTable("oauth_resource", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes"),
	customClaims: text("custom_claims"),
	dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", {
		mode: "boolean",
	}).default(false),
	disabled: integer("disabled", { mode: "boolean" }).default(false),
	createdAt: integer("created_at", { mode: "timestamp_ms" }),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
	policyVersion: integer("policy_version").default(1),
	metadata: text("metadata"),
});

export const oauthClientResource = sqliteTable(
	"oauth_client_resource",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => oauthResource.identifier, { onDelete: "cascade" }),
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
	},
	(table) => [index("oauth_client_resource_client_id_idx").on(table.clientId)],
);

export const oauthRefreshToken = sqliteTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources"),
		requestedUserInfoClaims: text("requested_user_info_claims"),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		revoked: integer("revoked", { mode: "timestamp_ms" }),
		rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: integer("rotation_replay_expires_at", {
			mode: "timestamp_ms",
		}),
		authTime: integer("auth_time", { mode: "timestamp_ms" }),
		confirmation: text("confirmation"),
		scopes: text("scopes").notNull(),
	},
	(table) => [index("oauth_refresh_token_user_id_idx").on(table.userId)],
);

export const oauthAccessToken = sqliteTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources"),
		requestedUserInfoClaims: text("requested_user_info_claims"),
		refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
			onDelete: "cascade",
		}),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		revoked: integer("revoked", { mode: "timestamp_ms" }),
		confirmation: text("confirmation"),
		scopes: text("scopes").notNull(),
	},
	(table) => [index("oauth_access_token_user_id_idx").on(table.userId)],
);

export const oauthConsent = sqliteTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		resources: text("resources"),
		requestedUserInfoClaims: text("requested_user_info_claims"),
		scopes: text("scopes").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [index("oauth_consent_user_id_idx").on(table.userId)],
);

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
