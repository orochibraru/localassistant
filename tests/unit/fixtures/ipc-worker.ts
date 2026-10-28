const output = process.argv[2] ?? "";

process.on(
	"message",
	async (message: { type?: string; config?: { appVersion?: string } }) => {
		if (message.type === "config") {
			await Bun.write(output, message.config?.appVersion ?? "");
			process.exit(0);
		}
	},
);
process.send?.({ type: "ready" });
