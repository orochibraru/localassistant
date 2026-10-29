export interface DayForecast {
	date: string;
	code: number;
	min: number;
	max: number;
	sunrise: string;
	sunset: string;
}

export interface Weather {
	temperature: number;
	feelsLike: number | null;
	code: number;
	isDay: boolean;
	windSpeed: number | null;
	days: DayForecast[];
}

export type WeatherKind =
	"clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

const kinds: [number[], WeatherKind, string][] = [
	[[0], "clear", "Clear"],
	[[1, 2], "partly", "Partly cloudy"],
	[[3], "cloudy", "Overcast"],
	[[45, 48], "fog", "Fog"],
	[[51, 53, 55, 56, 57], "drizzle", "Drizzle"],
	[[61, 63, 65, 66, 67, 80, 81, 82], "rain", "Rain"],
	[[71, 73, 75, 77, 85, 86], "snow", "Snow"],
	[[95, 96, 99], "storm", "Thunderstorm"],
];

/** What a WMO weather code (as Open-Meteo sends them) looks like, in a word and a kind for its icon. */
export function describeWeather(code: number): {
	kind: WeatherKind;
	label: string;
} {
	const match = kinds.find(([codes]) => codes.includes(code));
	return match
		? { kind: match[1], label: match[2] }
		: { kind: "cloudy", label: "Unknown" };
}

/** `iso` as a clock time in `timeZone` ("07:42"). */
export function clockTime(iso: string, timeZone: string | null): string {
	return new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: timeZone ?? undefined,
	}).format(new Date(iso));
}
