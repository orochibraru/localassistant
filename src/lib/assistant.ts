export const assistantRoles = ["user", "assistant"] as const;

export interface AssistantTurn {
	role: (typeof assistantRoles)[number];
	text: string;
}
