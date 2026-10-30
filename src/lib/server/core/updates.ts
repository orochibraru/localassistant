import { getSetting, setSetting } from "#lib/dto/setting.js";
import { configuration } from "#lib/server/core/config.js";

const releasesUrl =
	"https://api.github.com/repos/orochibraru/localassistant/releases/latest";

export interface UpdateNotice {
	version: string;
	url: string;
}

function parts(version: string): number[] {
	return (/\d+(?:\.\d+)*/.exec(version)?.[0] ?? "0").split(".").map(Number);
}

/** Whether `candidate` is a later version than `running`: "v1.10.0" is newer than "1.9.3". */
export function isNewer(candidate: string, running: string): boolean {
	const next = parts(candidate);
	const current = parts(running);
	for (
		let index = 0;
		index < Math.max(next.length, current.length);
		index += 1
	) {
		const difference = (next[index] ?? 0) - (current[index] ?? 0);
		if (difference !== 0) {
			return difference > 0;
		}
	}
	return false;
}

/** Asks GitHub once a day which LocalAssistant release is the latest, so admins hear about updates. */
class Updates {
	/** Fetches the latest release and records it; returns it, or `null` when GitHub doesn't answer. Never throws. */
	async check(fetcher: typeof fetch = fetch): Promise<UpdateNotice | null> {
		try {
			const response = await fetcher(releasesUrl, {
				headers: { accept: "application/vnd.github+json" },
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) {
				return null;
			}
			const release = (await response.json()) as {
				tag_name?: unknown;
				html_url?: unknown;
			};
			if (
				typeof release.tag_name !== "string" ||
				typeof release.html_url !== "string"
			) {
				return null;
			}
			const notice = { version: release.tag_name, url: release.html_url };
			setSetting("latestRelease", {
				...notice,
				checkedAt: new Date().toISOString(),
			});
			return notice;
		} catch {
			return null;
		}
	}

	/** The latest release when it's newer than the one running, else `null`. */
	available(): UpdateNotice | null {
		const latest = getSetting("latestRelease");
		return latest && isNewer(latest.version, configuration.get().appVersion)
			? { version: latest.version, url: latest.url }
			: null;
	}
}

export const updates = new Updates();
