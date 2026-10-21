// Non-destructive writes: facts merge with imported values winning, text only
// gains missing keys. Files are rewritten only when their content changes.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const readJson = async <T = Json>(
	path: string,
): Promise<T | undefined> =>
	existsSync(path)
		? (JSON.parse(await readFile(path, "utf8")) as T)
		: undefined;

export const listJson = async (dir: string) =>
	existsSync(dir)
		? (await readdir(dir))
				.filter((name) => name.endsWith(".json"))
				.map((name) => name.slice(0, -5))
		: [];

/** Imported values win; keys only the existing value has are kept. Arrays are replaced. */
export const mergeFacts = <T>(existing: unknown, incoming: T): T => {
	if (!isObject(existing) || !isObject(incoming)) return incoming;
	const merged: Json = { ...existing };
	for (const [key, value] of Object.entries(incoming)) {
		if (value === undefined) continue;
		merged[key] = mergeFacts(existing[key], value);
	}
	return merged as T;
};

/** Existing strings are never replaced; only missing keys are added. */
export const fillText = (existing: unknown, incoming: unknown): unknown => {
	if (existing === undefined) return incoming;
	if (!isObject(existing) || !isObject(incoming)) return existing;
	const merged: Json = { ...existing };
	for (const [key, value] of Object.entries(incoming)) {
		if (value === undefined) continue;
		merged[key] = fillText(existing[key], value);
	}
	return merged;
};

export const stats = { written: 0, unchanged: 0 };

export const writeJson = async ({
	path,
	data,
}: {
	path: string;
	data: unknown;
}) => {
	const body = `${JSON.stringify(data, null, "\t")}\n`;
	if (existsSync(path) && (await readFile(path, "utf8")) === body) {
		stats.unchanged++;
		return;
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, body);
	stats.written++;
};

export const writeText = async ({
	path,
	data,
}: {
	path: string;
	data: unknown;
}) => {
	const merged = fillText(await readJson(path), data);
	if (isObject(merged) && Object.keys(merged).length === 0) return;
	await writeJson({ path, data: merged });
};

export const dataPath = (...parts: string[]) => join("data", ...parts);
