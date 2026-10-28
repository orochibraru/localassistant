import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const dead: string[] = [];

for (const file of process.argv.slice(2)) {
	const text = (await Bun.file(file).text()).replaceAll(/```[\s\S]*?```/g, "");
	for (const [, target = ""] of text.matchAll(
		/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
	)) {
		if (/^(https?:|mailto:|#)/.test(target)) {
			continue;
		}
		const path = join(
			dirname(file),
			decodeURIComponent(target.split(/[?#]/)[0] ?? ""),
		);
		if (!existsSync(path) && !existsSync(`${path}.md`)) {
			dead.push(`${file}: ${target}`);
		}
	}
}

if (dead.length > 0) {
	console.error(
		`Links to files that don't exist:\n${dead.map((link) => `  ${link}`).join("\n")}`,
	);
	process.exit(1);
}
