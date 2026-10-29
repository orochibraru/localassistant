import type { HomeDTO, HomeLocation } from "#lib/dto/home.js";
import { Logger } from "#lib/server/core/logger.js";
import type { Weather } from "#lib/weather.js";

const logger = new Logger("Weather");

const forecastUrl = "https://api.open-meteo.com/v1/forecast";
const searchUrl = "https://geocoding-api.open-meteo.com/v1/search";
const timeoutMs = 10_000;

interface Forecast {
	utc_offset_seconds: number;
	current: {
		temperature_2m: number;
		apparent_temperature?: number;
		weather_code: number;
		is_day: number;
		wind_speed_10m?: number;
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		sunrise: string[];
		sunset: string[];
	};
}

interface Found {
	name: string;
	latitude: number;
	longitude: number;
	timezone?: string;
	country?: string;
	admin1?: string;
}

/** Places and weather from Open-Meteo: free, no key, only the home's coordinates leave the server. */
class WeatherService {
	/**
	 * Places matching `query`, in French then English names.
	 *
	 * @throws When Open-Meteo can't be reached.
	 */
	async search(query: string): Promise<HomeLocation[]> {
		const url = new URL(searchUrl);
		url.search = new URLSearchParams({
			name: query,
			count: "6",
			language: "fr",
			format: "json",
		}).toString();
		const body = (await this.#get(url)) as { results?: Found[] };
		return (body.results ?? []).map((found) => ({
			place: [found.name, found.admin1, found.country]
				.filter(Boolean)
				.join(", "),
			latitude: found.latitude,
			longitude: found.longitude,
			timezone: found.timezone ?? "UTC",
		}));
	}

	/**
	 * Today's and tomorrow's weather where `location` is, sunrise and sunset in UTC.
	 *
	 * @throws When Open-Meteo can't be reached.
	 */
	async forecast(location: HomeLocation): Promise<Weather> {
		const url = new URL(forecastUrl);
		url.search = new URLSearchParams({
			latitude: String(location.latitude),
			longitude: String(location.longitude),
			current:
				"temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
			daily:
				"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
			timezone: location.timezone,
			forecast_days: "2",
		}).toString();
		const body = (await this.#get(url)) as Forecast;
		const utc = (local: string) =>
			new Date(
				Date.parse(`${local}Z`) - body.utc_offset_seconds * 1000,
			).toISOString();
		return {
			temperature: body.current.temperature_2m,
			feelsLike: body.current.apparent_temperature ?? null,
			code: body.current.weather_code,
			isDay: body.current.is_day === 1,
			windSpeed: body.current.wind_speed_10m ?? null,
			days: body.daily.time.map((date, index) => ({
				date,
				code: body.daily.weather_code[index] ?? 3,
				min: body.daily.temperature_2m_min[index] ?? 0,
				max: body.daily.temperature_2m_max[index] ?? 0,
				sunrise: utc(body.daily.sunrise[index] ?? `${date}T06:00`),
				sunset: utc(body.daily.sunset[index] ?? `${date}T18:00`),
			})),
		};
	}

	/** Reads the weather of `home` and records it; never throws, a failed read keeps the last one. */
	async refresh(home: HomeDTO): Promise<void> {
		const location = home.location;
		if (!location) {
			return;
		}
		try {
			home.saveWeather(await this.forecast(location));
		} catch (error) {
			logger.warn("Weather read failed", { home: home.id }, error);
		}
	}

	async #get(url: URL): Promise<unknown> {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) {
			throw new Error(`Open-Meteo answered ${response.status}.`);
		}
		return response.json();
	}
}

export const weatherService = new WeatherService();
