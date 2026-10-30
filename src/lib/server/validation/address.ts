import { z } from "zod";

const example = "like http://192.168.1.10:5000 or https://frigate.example.com";

export const addressSchema = z
	.url({
		protocol: /^https?$/,
		normalize: true,
		hostname: /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])$/,
		error: `Type an address starting with http:// or https://, ${example}.`,
	})
	.refine((value) => {
		const url = URL.parse(value);
		return !url || (!url.username && !url.password && !url.search && !url.hash);
	}, `Type the address alone, without a password, query or #, ${example}.`)
	.transform((value) => value.replace(/\/+$/, ""));
