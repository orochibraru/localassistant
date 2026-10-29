import { error } from "@sveltejs/kit";
import type { BunFile } from "bun";

const types: Record<string, string> = {
	m3u8: "application/vnd.apple.mpegurl",
	ts: "video/mp2t",
	mp4: "video/mp4",
	jpg: "image/jpeg",
};

/**
 * A response for a file on disk that honours a single `Range` request, as video players ask for.
 *
 * @throws A 404 when the file is gone, a 416 when the range is outside it.
 */
export async function fileResponse(
	file: BunFile,
	request: Request,
	cacheControl: string,
): Promise<Response> {
	if (!(await file.exists())) {
		error(404, "Not found");
	}
	const extension = file.name?.split(".").at(-1) ?? "";
	const headers: Record<string, string> = {
		"Content-Type": types[extension] ?? "application/octet-stream",
		"Cache-Control": cacheControl,
		"Accept-Ranges": "bytes",
	};
	const size = file.size;
	const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
	if (!range) {
		return new Response(file, {
			headers: { ...headers, "Content-Length": String(size) },
		});
	}
	const start = range[1]
		? Number(range[1])
		: Math.max(0, size - Number(range[2]));
	const end =
		range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
	if (start >= size || start > end) {
		return new Response(null, {
			status: 416,
			headers: { "Content-Range": `bytes */${size}` },
		});
	}
	return new Response(file.slice(start, end + 1), {
		status: 206,
		headers: {
			...headers,
			"Content-Range": `bytes ${start}-${end}/${size}`,
			"Content-Length": String(end - start + 1),
		},
	});
}
