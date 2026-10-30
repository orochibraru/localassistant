export type Inline =
	| { type: "text"; text: string }
	| { type: "strong"; children: Inline[] }
	| { type: "emphasis"; children: Inline[] }
	| { type: "code"; text: string }
	| { type: "link"; href: string; children: Inline[] };

export type Block =
	| { type: "paragraph"; children: Inline[] }
	| { type: "heading"; level: number; children: Inline[] }
	| { type: "list"; ordered: boolean; items: Inline[][] }
	| { type: "code"; text: string };

const inlinePattern =
	/(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

/** Splits a line of Markdown into text, bold, italic, code and http(s) links; everything else stays text. */
export function parseInline(source: string): Inline[] {
	const result: Inline[] = [];
	let rest = source;
	while (rest.length > 0) {
		const match = inlinePattern.exec(rest);
		if (!match) {
			result.push({ type: "text", text: rest });
			break;
		}
		if (match.index > 0) {
			result.push({ type: "text", text: rest.slice(0, match.index) });
		}
		const [whole, , strong, , emphasis, code, label, href] = match;
		if (strong !== undefined) {
			result.push({ type: "strong", children: parseInline(strong) });
		} else if (emphasis !== undefined) {
			result.push({ type: "emphasis", children: parseInline(emphasis) });
		} else if (code !== undefined) {
			result.push({ type: "code", text: code });
		} else if (label !== undefined && href !== undefined) {
			result.push({ type: "link", href, children: parseInline(label) });
		}
		rest = rest.slice(match.index + whole.length);
	}
	return result;
}

const listItem = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

/** Parses the Markdown an assistant writes into blocks: paragraphs, headings, lists and code fences. */
export function parseMarkdown(source: string): Block[] {
	const blocks: Block[] = [];
	const lines = source.replaceAll("\r\n", "\n").split("\n");
	let paragraph: string[] = [];
	const closeParagraph = () => {
		if (paragraph.length > 0) {
			blocks.push({
				type: "paragraph",
				children: parseInline(paragraph.join(" ")),
			});
			paragraph = [];
		}
	};
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.trimStart().startsWith("```")) {
			closeParagraph();
			const code: string[] = [];
			index += 1;
			while (
				index < lines.length &&
				!(lines[index] ?? "").trimStart().startsWith("```")
			) {
				code.push(lines[index] ?? "");
				index += 1;
			}
			blocks.push({ type: "code", text: code.join("\n") });
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		const item = listItem.exec(line);
		if (heading) {
			closeParagraph();
			blocks.push({
				type: "heading",
				level: heading[1]?.length ?? 1,
				children: parseInline(heading[2] ?? ""),
			});
		} else if (item) {
			closeParagraph();
			const ordered = item[2] !== undefined;
			const previous = blocks.at(-1);
			const content = parseInline(item[3] ?? "");
			if (previous?.type === "list" && previous.ordered === ordered) {
				previous.items.push(content);
			} else {
				blocks.push({ type: "list", ordered, items: [content] });
			}
		} else if (line.trim() === "") {
			closeParagraph();
		} else {
			paragraph.push(line.trim());
		}
	}
	closeParagraph();
	return blocks;
}
