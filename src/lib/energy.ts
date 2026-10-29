export const energyPresets = [
	"today",
	"yesterday",
	"last-3-days",
	"this-week",
	"this-month",
	"last-month",
	"last-3-months",
	"this-year",
	"year-to-date",
	"all-time",
] as const;
export type EnergyPreset = (typeof energyPresets)[number];

export const energySeasons = ["spring", "summer", "autumn", "winter"] as const;
export type EnergySeason = (typeof energySeasons)[number];

export const energyPresetLabels: Record<EnergyPreset, string> = {
	today: "Today",
	yesterday: "Yesterday",
	"last-3-days": "Last 3 days",
	"this-week": "This week",
	"this-month": "This month",
	"last-month": "Last month",
	"last-3-months": "Last 3 months",
	"this-year": "This year",
	"year-to-date": "Year to date",
	"all-time": "All time",
};

export type EnergyUnit = "hour" | "day" | "month";

export interface EnergyBucket {
	key: string;
	kilowattHours: number;
}

export interface EnergySummary {
	days: EnergyBucket[];
	thisMonth: number;
	lastMonth: number;
	averagePerDay: number;
}

export interface EnergyRange {
	key: string;
	from: string;
	to: string;
	unit: EnergyUnit;
}

export interface EnergyReport {
	range: EnergyRange;
	today: string;
	months: string[];
	house: {
		metered: boolean;
		buckets: EnergyBucket[];
		total: number;
		previousTotal: number;
		averagePerDay: number;
		peak: EnergyBucket | null;
		lowest: EnergyBucket | null;
		projection: number | null;
	};
	profile: {
		cumulative: { day: string; current: number | null; previous: number }[];
		weekdays: number[];
		hours: number[] | null;
	};
	appliances: {
		deviceId: string;
		name: string;
		kind: string;
		total: number;
		share: number | null;
		buckets: EnergyBucket[];
	}[];
}

const monthFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	year: "2-digit",
	timeZone: "UTC",
});
const longMonthFormat = new Intl.DateTimeFormat(undefined, {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});

/** A bucket key in words for a chart: "14h" for an hour, "28/10" for a day, "Oct 26" for a month. */
export function bucketLabel(key: string, unit: EnergyUnit): string {
	if (unit === "hour") {
		return `${key.slice(11)}h`;
	}
	if (unit === "day") {
		return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
	}
	return monthFormat.format(new Date(`${key}-01T00:00:00Z`));
}

/** A month ("2026-09") in words: "September 2026". */
export function monthName(month: string): string {
	return longMonthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

/** A day ("2026-10-28") in words: "28 Oct 2026". */
export function dayName(day: string): string {
	return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** What a period is called: a preset's name, "September 2026", "Winter 2025–26" or "1 Oct 2026 to 5 Oct 2026". */
export function rangeLabel(range: EnergyRange): string {
	const preset = energyPresets.find((entry) => entry === range.key);
	if (preset) {
		return energyPresetLabels[preset];
	}
	if (range.key.startsWith("month:")) {
		return monthName(range.key.slice(6));
	}
	if (range.key.startsWith("season:")) {
		const season = range.key.slice(7);
		const name = `${season.charAt(0).toUpperCase()}${season.slice(1)}`;
		const start = range.from.slice(0, 4);
		const end = range.to.slice(0, 4);
		return start === end
			? `${name} ${start}`
			: `${name} ${start}–${end.slice(2)}`;
	}
	return `${dayName(range.from)} to ${dayName(range.to)}`;
}
