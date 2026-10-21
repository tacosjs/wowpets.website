// Cached, throttled HTTP for import scripts. Every response is kept under
// .cache/import/ so re-runs don't hit the network.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const cacheRoot = ".cache/import";

const userAgent = "wowpets.website-import/0.1 (data import, ~1 request/s)";
const throttleMs = 1000;
const timeoutMs = 30_000;
const maxAttempts = 4;
const retryDelayMs = 5_000;
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchCached = async ({
	url,
	cacheFile,
}: {
	url: string;
	/** Path under .cache/import/ */
	cacheFile: string;
}): Promise<string> => {
	const path = join(cacheRoot, cacheFile);
	if (existsSync(path)) return readFile(path, "utf8");

	let body: string | undefined;
	for (let attempt = 1; body === undefined; attempt++) {
		const wait = lastRequestAt + throttleMs - Date.now();
		if (wait > 0) await sleep(wait);
		lastRequestAt = Date.now();
		try {
			const response = await fetch(url, {
				headers: { "User-Agent": userAgent },
				// Without a timeout a stalled connection hangs the whole import.
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (!response.ok) {
				const retryable = response.status === 429 || response.status >= 500;
				throw Object.assign(new Error(`HTTP ${response.status}`), {
					retryable,
				});
			}
			body = await response.text();
			console.info(`  GET ${url} (${Date.now() - lastRequestAt} ms)`);
		} catch (error) {
			const { message, retryable = true } = error as Error & {
				retryable?: boolean;
			};
			if (!retryable || attempt >= maxAttempts) {
				throw new Error(
					`GET ${url} failed after ${attempt} attempt(s): ${message}`,
				);
			}
			console.warn(`  retry ${attempt}/${maxAttempts - 1} ${url}: ${message}`);
			await sleep(retryDelayMs * attempt);
		}
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, body);
	return body;
};
