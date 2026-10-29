export const presenceEvents = ["arrive", "leave"] as const;
export type PresenceEvent = (typeof presenceEvents)[number];

export interface PersonPresence {
	id: string;
	name: string;
	home: boolean | null;
	changedAt: Date | null;
	tracked: boolean;
}
