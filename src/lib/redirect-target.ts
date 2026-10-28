/** A form action on the current page that keeps its `redirectTo`, which a bare `?/name` action would drop. */
export function keepRedirect(
	action: string,
	url: { searchParams: Pick<URLSearchParams, "get"> },
): string {
	const target = url.searchParams.get("redirectTo");
	return target ? `${action}&redirectTo=${encodeURIComponent(target)}` : action;
}
