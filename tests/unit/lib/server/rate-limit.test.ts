import { describe, expect, test } from "bun:test";

import { RateLimiter, rateLimits } from "#lib/server/auth/rate-limit.js";

describe("RateLimiter", () => {
	test("blocks a key once it used its attempts, until the window slides past", () => {
		const limiter = new RateLimiter(2, 1_000);
		limiter.hit("ada", 0);
		expect(limiter.blocked("ada", 10)).toBe(false);
		limiter.hit("ada", 20);
		expect(limiter.blocked("ada", 30)).toBe(true);
		expect(limiter.blocked("grace", 30)).toBe(false);
		expect(limiter.blocked("ada", 1_001)).toBe(false);
		limiter.hit("ada", 1_100);
		limiter.reset("ada");
		expect(limiter.blocked("ada", 1_100)).toBe(false);
	});

	test("forgets quiet keys once too many pile up", () => {
		const limiter = new RateLimiter(1, 10);
		for (let index = 0; index <= 50_000; index += 1) {
			limiter.hit(`key-${index}`, 0);
		}
		expect(limiter.blocked("key-1", 5)).toBe(true);
		limiter.hit("late", 100);
		expect(limiter.blocked("key-1", 5)).toBe(false);
		expect(limiter.blocked("late", 100)).toBe(true);
	});
});

describe("mayEmail", () => {
	test("allows three emails per recipient, then waits", () => {
		const recipient = `limit-${crypto.randomUUID()}@example.com`;
		const client = crypto.randomUUID();
		expect(rateLimits.mayEmail(recipient, client)).toBe(true);
		expect(rateLimits.mayEmail(recipient, client)).toBe(true);
		expect(rateLimits.mayEmail(recipient, client)).toBe(true);
		expect(rateLimits.mayEmail(recipient, client)).toBe(false);
	});

	test("caps one client across recipients", () => {
		const client = crypto.randomUUID();
		for (let index = 0; index < 20; index += 1) {
			expect(
				rateLimits.mayEmail(`${client}-${index}@example.com`, client),
			).toBe(true);
		}
		expect(rateLimits.mayEmail(`${client}-last@example.com`, client)).toBe(
			false,
		);
	});
});
