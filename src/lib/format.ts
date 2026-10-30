const byteUnits = ["B", "KB", "MB", "GB", "TB"];

/** A size in bytes the way people read it: "812 KB", "3.4 GB". */
export function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < byteUnits.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toLocaleString("en", { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 })} ${byteUnits[unit]}`;
}

/** A duration in seconds in words: "3 days", "5 hours", "12 minutes". */
export function formatDuration(seconds: number): string {
	const steps: [number, string][] = [
		[86_400, "day"],
		[3600, "hour"],
		[60, "minute"],
	];
	for (const [size, word] of steps) {
		const count = Math.floor(seconds / size);
		if (count >= 1) {
			return `${count} ${word}${count === 1 ? "" : "s"}`;
		}
	}
	return "less than a minute";
}
