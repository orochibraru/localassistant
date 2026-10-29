import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { weatherService } from "#lib/server/house/weather.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import { clockTime, describeWeather } from "#lib/weather.js";

import { resetDatabase } from "../../database.js";

const paris = {
	place: "Paris, Île-de-France, France",
	latitude: 48.85,
	longitude: 2.35,
	timezone: "Europe/Paris",
};

const forecast = {
	utc_offset_seconds: 3600,
	current: {
		temperature_2m: 12.4,
		apparent_temperature: 10.1,
		weather_code: 2,
		is_day: 1,
		wind_speed_10m: 14,
	},
	daily: {
		time: ["2026-10-29", "2026-10-30"],
		weather_code: [2, 61],
		temperature_2m_max: [14, 11],
		temperature_2m_min: [6, 7],
		sunrise: ["2026-10-29T07:24", "2026-10-30T07:26"],
		sunset: ["2026-10-29T17:21", "2026-10-30T17:19"],
	},
};

let calls: string[] = [];

function fakeOpenMeteo(input: string | URL | Request) {
	const url = String(input);
	calls.push(url);
	if (url.includes("geocoding")) {
		return Promise.resolve(
			Response.json({
				results: [
					{
						name: "Paris",
						latitude: 48.85,
						longitude: 2.35,
						timezone: "Europe/Paris",
						country: "France",
						admin1: "Île-de-France",
					},
					{ name: "Paris", latitude: 33.66, longitude: -95.55 },
				],
			}),
		);
	}
	return Promise.resolve(Response.json(forecast));
}

beforeEach(() => {
	resetDatabase();
	calls = [];
});

afterEach(() => {
	mock.restore();
});

describe("weather", () => {
	test("searches places and reads the forecast, sun times in UTC", async () => {
		spyOn(globalThis, "fetch").mockImplementation(
			fakeOpenMeteo as typeof fetch,
		);
		expect(await weatherService.search("Paris")).toEqual([
			paris,
			{ place: "Paris", latitude: 33.66, longitude: -95.55, timezone: "UTC" },
		]);
		const weather = await weatherService.forecast(paris);
		expect(weather).toMatchObject({
			temperature: 12.4,
			feelsLike: 10.1,
			code: 2,
			isDay: true,
		});
		expect(weather.days[0]).toEqual({
			date: "2026-10-29",
			code: 2,
			min: 6,
			max: 14,
			sunrise: "2026-10-29T06:24:00.000Z",
			sunset: "2026-10-29T16:21:00.000Z",
		});
		expect(calls[1]).toContain("timezone=Europe%2FParis");
	});

	test("a located home gets its weather from the job, and a failed read keeps the last one", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			fakeOpenMeteo as typeof fetch,
		);
		const home = HomeDTO.first();
		await jobHandlers["weather.refresh"]({});
		expect(HomeDTO.find(home.id)?.weather).toBeNull();
		home.locate(paris);
		expect(home.location).toEqual(paris);
		await jobHandlers["weather.refresh"]({ homeId: home.id });
		expect(HomeDTO.find(home.id)?.weather?.temperature).toBe(12.4);
		fetchMock.mockImplementation((() =>
			Promise.resolve(
				new Response("down", { status: 503 }),
			)) as unknown as typeof fetch);
		await jobHandlers["weather.refresh"]({});
		expect(HomeDTO.find(home.id)?.weather?.temperature).toBe(12.4);
		expect(JobDTO.isQueued("weather.refresh")).toBe(true);
		await jobHandlers["weather.refresh"]({ homeId: "gone" });
		home.locate(null);
		expect(HomeDTO.find(home.id)?.toJSON()).toMatchObject({
			place: null,
			weather: null,
		});
	});

	test("describes weather codes and clock times", () => {
		expect(describeWeather(0)).toEqual({ kind: "clear", label: "Clear" });
		expect(describeWeather(63).kind).toBe("rain");
		expect(describeWeather(1234)).toEqual({ kind: "cloudy", label: "Unknown" });
		expect(clockTime("2026-10-29T06:24:00.000Z", "Europe/Paris")).toBe("07:24");
		expect(clockTime("2026-10-29T06:24:00.000Z", "UTC")).toBe("06:24");
	});
});
