import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
				experimental: { async: true },
			},
			adapter: adapter({ buildOptions: { compile: true } }),
			experimental: { remoteFunctions: true },
			paths: { relative: false },
			csrf: { trustedOrigins: ["*"] },
			csp: {
				directives: {
					"frame-ancestors": ["none"],
					"object-src": ["none"],
					"base-uri": ["self"],
				},
			},
		}),
	],
	build: {
		target: "es2022",
		cssMinify: true,
		reportCompressedSize: false,
	},
});
