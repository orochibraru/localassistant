import type { HistoryRange } from "#lib/history.js";

export type DashboardSection =
	| { type: "heading"; text: string }
	| { type: "devices"; deviceIds: string[] }
	| { type: "scenes"; sceneIds: string[] }
	| { type: "weather" }
	| { type: "people" }
	| { type: "graph"; deviceId: string; range: HistoryRange };

export interface DashboardDefinition {
	name: string;
	sections: DashboardSection[];
}
