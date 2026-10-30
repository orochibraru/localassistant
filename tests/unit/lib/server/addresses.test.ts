import { describe, expect, spyOn, test } from "bun:test";
import dns from "node:dns/promises";

import { requestHeaders } from "#lib/plugin-sdk.js";
import { isSecretField, parseHeaders } from "#lib/plugins.js";
import { addresses } from "#lib/server/http/addresses.js";
import { addressSchema } from "#lib/server/validation/address.js";
import { valuesSchema } from "#lib/server/validation/plugins.js";

describe("addresses", () => {
	test("take internal names and IPs over http or https, normalized, and refuse the rest", () => {
		expect(addressSchema.parse("HTTP://Frigate.LAN:5000/")).toBe(
			"http://frigate.lan:5000",
		);
		expect(addressSchema.parse("http://frigate:5000")).toBe(
			"http://frigate:5000",
		);
		expect(addressSchema.parse("http://[fd00::1]:5000")).toBe(
			"http://[fd00::1]:5000",
		);
		expect(addressSchema.parse("https://nvr.example.com/frigate/")).toBe(
			"https://nvr.example.com/frigate",
		);
		for (const wrong of [
			"frigate.lan",
			"ftp://frigate",
			"http://user:pass@frigate",
			"http://frigate?x=1",
		]) {
			expect(addressSchema.safeParse(wrong).success).toBe(false);
		}
	});

	test("an IP needs no lookup, a name must resolve from the server", async () => {
		const lookup = spyOn(dns, "lookup");
		expect(await addresses.resolves("http://192.168.1.10:5000")).toBe(true);
		expect(await addresses.resolves("http://[fd00::1]:5000")).toBe(true);
		expect(lookup).not.toHaveBeenCalled();
		lookup.mockResolvedValueOnce({ address: "10.0.0.5", family: 4 } as never);
		expect(await addresses.resolves("http://frigate.lan:5000")).toBe(true);
		lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
		expect(await addresses.resolves("http://nowhere.lan")).toBe(false);
		lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
		await expect(
			addresses.check([{ name: "url", label: "Address", type: "url" }], {
				url: "http://nowhere.lan",
				other: 1,
			}),
		).rejects.toThrow("The server can't find nowhere.lan. Check address");
		await addresses.check(
			[
				{ name: "url", label: "Address", type: "url", optional: true },
				{ name: "name", label: "Name", type: "text" },
			],
			{ name: "x" },
		);
		lookup.mockRestore();
	});

	test("headers are Name: value lines, kept secret like passwords", () => {
		expect(parseHeaders("X-Token: abc\n\nAuthorization: Bearer x y")).toEqual({
			"X-Token": "abc",
			Authorization: "Bearer x y",
		});
		expect(parseHeaders("not a header")).toBeNull();
		expect(requestHeaders("X-Token: abc\nbroken\n: nothing")).toEqual({
			"X-Token": "abc",
		});
		expect(requestHeaders(undefined)).toEqual({});
		expect(isSecretField({ type: "headers" })).toBe(true);
		expect(isSecretField({ type: "url" })).toBe(false);
		const schema = valuesSchema(
			[
				{ name: "url", label: "Address", type: "url" },
				{
					name: "headers",
					label: "Extra headers",
					type: "headers",
					optional: true,
				},
			],
			true,
		);
		expect(
			schema.parse({
				"value:url": "http://Frigate:5000/",
				"value:headers": "",
			}),
		).toEqual({ url: "http://frigate:5000" });
		const wrong = schema.safeParse({
			"value:url": "frigate",
			"value:headers": "nope",
		});
		expect(wrong.success).toBe(false);
		expect(wrong.error?.issues.map((issue) => issue.message)).toEqual([
			expect.stringContaining("starting with http://"),
			"Write one header per line, like X-Api-Key: secret.",
		]);
	});
});
