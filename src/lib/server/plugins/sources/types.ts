import type { PluginSourceKind } from "#lib/plugins.js";

export interface Location {
	kind: PluginSourceKind;
	origin: string;
	repository: string;
	path: string;
	ref: string | null;
}

export interface RepositoryInfo {
	repository: string;
	description: string;
	url: string | null;
	stars: number | null;
	archived: boolean;
	pushedAt: string | null;
	defaultBranch: string;
}

export interface Release {
	tag: string;
	publishedAt: string | null;
}

export interface Forge {
	parse(origin: string, segments: string[]): Omit<Location, "kind" | "origin">;
	webUrl(location: Location, branch: string): string | null;
	repository(location: Location, token: string | null): Promise<RepositoryInfo>;
	latestRelease(
		location: Location,
		token: string | null,
	): Promise<Release | null>;
	commit(
		location: Location,
		ref: string,
		token: string | null,
	): Promise<string>;
	download(
		location: Location,
		sha: string,
		path: string,
		token: string | null,
	): Promise<Uint8Array | null>;
	checkToken(origin: string, token: string): Promise<void>;
	search?(): Promise<RepositoryInfo[]>;
}
