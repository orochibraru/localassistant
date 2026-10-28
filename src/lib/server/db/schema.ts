import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

export const deviceKinds = [
	"tuya-cover",
	"melcloud-ata",
	"melcloud-atw",
	"bambu-printer",
] as const;

export const device = sqliteTable(
	"device",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kind: text("kind", { enum: deviceKinds }).notNull(),
		name: text("name").notNull(),
		externalId: text("external_id").notNull(),
		host: text("host"),
		protocolVersion: text("protocol_version"),
		localKey: text("local_key"),
		inverted: integer("inverted", { mode: "boolean" }).notNull().default(false),
		buildingId: integer("building_id"),
		controlDp: integer("control_dp").notNull().default(1),
		positionDp: integer("position_dp").notNull().default(2),
		positionStateDp: integer("position_state_dp").notNull().default(3),
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
