import { eq } from "drizzle-orm";

import type { PluginValues } from "#lib/plugins.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { setting } from "#lib/server/db/schema.js";

export const smtpSecurityModes = ["tls", "starttls", "none"] as const;

export interface SmtpSettings {
	host: string;
	port: number;
	security: (typeof smtpSecurityModes)[number];
	username: string;
	encryptedPassword: string;
	fromAddress: string;
	fromName: string;
}

export interface SsoProvider {
	id: string;
	name: string;
	discoveryUrl: string;
	clientId: string;
	encryptedClientSecret: string;
	enabled: boolean;
}

export interface MqttBroker {
	url: string;
	username: string | null;
	encryptedPassword: string | null;
	homeId: string;
}

export interface PluginSettings {
	homeId: string | null;
	values: PluginValues;
	secrets: Record<string, string>;
}

export interface SourceToken {
	site: string;
	encryptedToken: string;
}

export interface VapidKeys {
	publicKey: string;
	encryptedPrivateKey: string;
}

export interface LatestRelease {
	version: string;
	url: string;
	checkedAt: string;
}

export interface AssistantSettings {
	encryptedApiKey: string;
}

export const sessionDayOptions = [1, 7, 30] as const;

export interface SettingValues {
	requireTwoFactor: boolean;
	requirePasskey: boolean;
	sessionDays: (typeof sessionDayOptions)[number];
	smtp: SmtpSettings | null;
	mqtt: MqttBroker | null;
	disabledPlugins: string[];
	sourceTokens: SourceToken[];
	multipleHomes: boolean;
	passwordSignIn: boolean;
	passkeySignIn: boolean;
	magicLinkSignIn: boolean;
	emailCodeSignIn: boolean;
	ssoProviders: SsoProvider[];
	vapid: VapidKeys | null;
	publicOrigin: string | null;
	assistant: AssistantSettings | null;
	aiHiddenDevices: string[];
	latestRelease: LatestRelease | null;
}

const defaults: SettingValues = {
	requireTwoFactor: false,
	requirePasskey: false,
	sessionDays: 7,
	smtp: null,
	mqtt: null,
	disabledPlugins: [],
	sourceTokens: [],
	multipleHomes: false,
	passwordSignIn: true,
	passkeySignIn: true,
	magicLinkSignIn: false,
	emailCodeSignIn: false,
	ssoProviders: [],
	vapid: null,
	publicOrigin: null,
	assistant: null,
	aiHiddenDevices: [],
	latestRelease: null,
};

/** The stored value of `key`, or its default. */
export function getSetting<Key extends keyof SettingValues>(
	key: Key,
): SettingValues[Key] {
	const row = databaseConnection
		.get()
		.select({ value: setting.value })
		.from(setting)
		.where(eq(setting.key, key))
		.get();
	return row ? (row.value as SettingValues[Key]) : defaults[key];
}

/** Every setting, defaults filled in. */
export function allSettings(): SettingValues {
	return {
		requireTwoFactor: getSetting("requireTwoFactor"),
		requirePasskey: getSetting("requirePasskey"),
		sessionDays: getSetting("sessionDays"),
		smtp: getSetting("smtp"),
		mqtt: getSetting("mqtt"),
		disabledPlugins: getSetting("disabledPlugins"),
		sourceTokens: getSetting("sourceTokens"),
		multipleHomes: getSetting("multipleHomes"),
		passwordSignIn: getSetting("passwordSignIn"),
		passkeySignIn: getSetting("passkeySignIn"),
		magicLinkSignIn: getSetting("magicLinkSignIn"),
		emailCodeSignIn: getSetting("emailCodeSignIn"),
		ssoProviders: getSetting("ssoProviders"),
		vapid: getSetting("vapid"),
		publicOrigin: getSetting("publicOrigin"),
		assistant: getSetting("assistant"),
		aiHiddenDevices: getSetting("aiHiddenDevices"),
		latestRelease: getSetting("latestRelease"),
	};
}

/** Stores `value` for `key`; `null` clears it back to its default. */
export function setSetting<Key extends keyof SettingValues>(
	key: Key,
	value: SettingValues[Key],
): void {
	if (value === null) {
		databaseConnection.get().delete(setting).where(eq(setting.key, key)).run();
		return;
	}
	databaseConnection
		.get()
		.insert(setting)
		.values({ key, value })
		.onConflictDoUpdate({
			target: setting.key,
			set: { value, updatedAt: new Date() },
		})
		.run();
}

/** What an admin connected a plugin with, its secrets still encrypted, or `null` when it isn't connected. */
export function getPluginSettings(pluginId: string): PluginSettings | null {
	const row = databaseConnection
		.get()
		.select({ value: setting.value })
		.from(setting)
		.where(eq(setting.key, `plugin:${pluginId}`))
		.get();
	return row ? (row.value as PluginSettings) : null;
}

/** Stores what a plugin is connected with; `null` disconnects it. */
export function setPluginSettings(
	pluginId: string,
	value: PluginSettings | null,
): void {
	const key = `plugin:${pluginId}`;
	if (value === null) {
		databaseConnection.get().delete(setting).where(eq(setting.key, key)).run();
		return;
	}
	databaseConnection
		.get()
		.insert(setting)
		.values({ key, value })
		.onConflictDoUpdate({
			target: setting.key,
			set: { value, updatedAt: new Date() },
		})
		.run();
}
