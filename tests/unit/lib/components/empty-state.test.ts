import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import UsersIcon from "@lucide/svelte/icons/users";
import { render } from "@testing-library/svelte";

import EmptyState from "#lib/components/empty-state.svelte";

describe("EmptyState", () => {
	beforeAll(() => GlobalRegistrator.register());
	afterAll(() => GlobalRegistrator.unregister());

	test("renders its title and subtitle", () => {
		const { getByText } = render(EmptyState, {
			icon: UsersIcon,
			title: "No groups yet",
			subtitle: "Create one.",
		});
		expect(getByText("No groups yet")).toBeTruthy();
		expect(getByText("Create one.")).toBeTruthy();
	});
});
