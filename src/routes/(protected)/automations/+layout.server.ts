import { SceneDTO } from "#lib/dto/scene.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return {
		scenes: SceneDTO.inHome(home.id).map((scene) => scene.toJSON()),
	};
};
