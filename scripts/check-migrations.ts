import { $ } from "bun";

const baseIndex = process.argv.indexOf("--base");
const base = baseIndex === -1 ? undefined : process.argv[baseIndex + 1];

const range = base ? [`${base}...HEAD`] : ["--cached"];
const changed = (
	await $`git diff --name-only --diff-filter=MDR ${range} -- drizzle/`.text()
)
	.split("\n")
	.filter(
		(path) =>
			path.endsWith(".sql") || /^drizzle\/meta\/\d+_snapshot\.json$/.test(path),
	);

const upstream = base
	? undefined
	: (
			await $`git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`
				.nothrow()
				.quiet()
				.text()
		).trim() || undefined;

async function blob(revision: string): Promise<string | undefined> {
	const result = await $`git rev-parse ${revision}`.nothrow().quiet();
	return result.exitCode === 0 ? result.text().trim() : undefined;
}

async function rewritesPushedHistory(path: string): Promise<boolean> {
	if (!upstream) {
		return true;
	}
	const pushed = await blob(`${upstream}:${path}`);
	return pushed !== undefined && pushed !== (await blob(`:${path}`));
}

const violations: string[] = [];
for (const path of changed) {
	if (await rewritesPushedHistory(path)) {
		violations.push(path);
	}
}

if (violations.length > 0) {
	console.error(
		`Committed migrations are append-only, but these were edited, renamed or deleted:\n${violations.map((path) => `  ${path}`).join("\n")}\n` +
			"Restore them and add the change as a new migration with `bun run db:generate`.",
	);
	process.exit(1);
}
