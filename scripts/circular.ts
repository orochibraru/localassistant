import madge from "madge";

const result = await madge("./src", {
	fileExtensions: ["ts"],
	tsConfig: "./tsconfig.madge.json",
	detectiveOptions: { ts: { skipTypeImports: true } },
});

const blind = result.warnings().skipped.filter((path) => path.startsWith("#"));
if (blind.length > 0) {
	console.error("madge could not resolve these imports:", blind);
	process.exit(1);
}

const circular = result.circular();
if (circular.length > 0) {
	console.error(`Found ${circular.length} circular imports`, circular);
	process.exit(1);
}

console.log("No circular imports.");
