// Bundles every data/**/*.json file into the server build and parses it once.
// Server-only: import it from createServerFn handlers, never from components.
import {
	buildDataset,
	type DatasetOf,
	type GameVersion,
	gameVersions,
	type Issue,
} from "./dataset";
import { checkIntegrity } from "./integrity";
import { type VersionDefinitions, versionDefinitions } from "./versions";

const rawFiles = import.meta.glob<unknown>("/data/**/*.json", {
	eager: true,
	import: "default",
});

type Datasets = { [V in GameVersion]: DatasetOf<VersionDefinitions[V]> };

let loaded: { datasets: Datasets; issues: Issue[] } | undefined;

/** Parses and checks every version. Errors are returned, not thrown. */
export function loadAll() {
	if (loaded) return loaded;
	const issues: Issue[] = [];
	const datasets = {} as Record<GameVersion, unknown>;
	for (const version of gameVersions) {
		const prefix = `/data/${version}/`;
		const files: Record<string, unknown> = {};
		for (const [path, value] of Object.entries(rawFiles)) {
			if (path.startsWith(prefix)) files[path.slice(prefix.length)] = value;
		}
		const definition = versionDefinitions[version];
		const built = buildDataset({ definition, files });
		issues.push(
			...built.issues,
			...checkIntegrity({ definition, dataset: built.dataset }),
		);
		datasets[version] = built.dataset;
	}
	for (const path of Object.keys(rawFiles)) {
		const version = path.split("/")[2];
		if (!(gameVersions as readonly string[]).includes(version)) {
			issues.push({
				level: "error",
				file: path.slice("/data/".length),
				message: `Unknown game version folder "${version}"`,
			});
		}
	}
	loaded = { datasets: datasets as Datasets, issues };
	return loaded;
}

export function formatIssues(issues: Issue[]) {
	return issues
		.map(
			(issue) =>
				`${issue.level.toUpperCase()} data/${issue.file}${issue.path ? ` → ${issue.path}` : ""}: ${issue.message}`,
		)
		.join("\n");
}

/** A version's dataset; refuses to serve data that failed validation. */
export function getDataset<V extends GameVersion>(version: V): Datasets[V] {
	const { datasets, issues } = loadAll();
	const errors = issues.filter((issue) => issue.level === "error");
	if (errors.length > 0) {
		throw new Error(
			`Invalid data (run pnpm data:check):\n${formatIssues(errors)}`,
		);
	}
	return datasets[version];
}
