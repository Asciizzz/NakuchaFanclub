export async function readText(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`[WeebRenderBeta.other] failed to read "${url}"`);
	return response.text();
}
