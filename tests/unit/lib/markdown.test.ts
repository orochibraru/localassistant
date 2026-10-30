import { describe, expect, test } from "bun:test";

import { parseInline, parseMarkdown } from "#lib/markdown.js";

describe("markdown", () => {
	test("reads bold, italic, code and http links, and leaves anything else as text", () => {
		expect(
			parseInline(
				"**PAC** is *on*, `21°` [docs](https://x.example) [no](javascript:alert(1))",
			),
		).toEqual([
			{ type: "strong", children: [{ type: "text", text: "PAC" }] },
			{ type: "text", text: " is " },
			{ type: "emphasis", children: [{ type: "text", text: "on" }] },
			{ type: "text", text: ", " },
			{ type: "code", text: "21°" },
			{ type: "text", text: " " },
			{
				type: "link",
				href: "https://x.example",
				children: [{ type: "text", text: "docs" }],
			},
			{ type: "text", text: " [no](javascript:alert(1))" },
		]);
		expect(parseInline("3 * 4 = 12")).toEqual([
			{ type: "text", text: "3 * 4 = 12" },
		]);
	});

	test("groups paragraphs, headings, lists and code fences", () => {
		const blocks = parseMarkdown(
			"Two things:\n\n- **PAC** is on\n- X30 cleans\n\n1. first\n2. second\n## Next\nline one\nline two\n```\ncode here\n```",
		);
		expect(blocks.map((block) => block.type)).toEqual([
			"paragraph",
			"list",
			"list",
			"heading",
			"paragraph",
			"code",
		]);
		expect(blocks[1]).toMatchObject({
			ordered: false,
			items: [[{ type: "strong" }, { type: "text" }], [{ type: "text" }]],
		});
		expect(blocks[2]).toMatchObject({ ordered: true });
		expect(blocks[3]).toMatchObject({ level: 2 });
		expect(blocks[4]).toEqual({
			type: "paragraph",
			children: [{ type: "text", text: "line one line two" }],
		});
		expect(blocks[5]).toEqual({ type: "code", text: "code here" });
	});
});
