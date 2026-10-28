const systems: [RegExp, string][] = [
	[/iPhone/, "iPhone"],
	[/iPad/, "iPad"],
	[/Android/, "Android"],
	[/Macintosh|Mac OS X/, "Mac"],
	[/Windows/, "Windows"],
	[/CrOS/, "ChromeOS"],
	[/Linux/, "Linux"],
];

const browsers: [RegExp, string][] = [
	[/Edg\//, "Edge"],
	[/Firefox\//, "Firefox"],
	[/SamsungBrowser\//, "Samsung Internet"],
	[/Chrome\//, "Chrome"],
	[/Safari\//, "Safari"],
];

/** A readable name for the device a user agent string describes, like "Safari on iPhone". */
export function deviceName(userAgent: string): string {
	const system = systems.find(([pattern]) => pattern.test(userAgent))?.[1];
	const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
	if (system && browser) {
		return `${browser} on ${system}`;
	}
	return system ?? browser ?? "This browser";
}

/** The bytes of a base64url string, as `pushManager.subscribe` wants its server key. */
export function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
