export const sceneActionPrefix = "scene:";

/** The push action that sets the scene with `sceneId` when its button is tapped. */
export function sceneAction(sceneId: string): string {
	return `${sceneActionPrefix}${sceneId}`;
}
