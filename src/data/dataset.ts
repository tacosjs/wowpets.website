// Parses one version's raw JSON files (keyed by path relative to data/<version>/)
// into typed indexes. Pure: no globbing, so tests can feed in-memory fixtures.
import type { z } from "zod";
import { baseLocale, locales } from "#/paraglide/runtime";
import {
	abilitiesText,
	type BaseText,
	familyText,
	lookText,
	type ModelGroupFacts,
	type NpcFactsBase,
	type TextMode,
	type TranslationText,
	type VersionFacts,
	versionFacts,
	versionText,
	type ZoneFacts,
	zoneFacts,
	zonesText,
} from "./schema/common";

export type Locale = (typeof locales)[number];

export const gameVersions = ["retail", "classic", "forever"] as const;
export type GameVersion = (typeof gameVersions)[number];

export function isGameVersion(value: string): value is GameVersion {
	return (gameVersions as readonly string[]).includes(value);
}

export function isLocale(value: string): value is Locale {
	return (locales as readonly string[]).includes(value);
}

export type FamilyBase = {
	id: string;
	modelGroups: ModelGroupFacts[];
	otherFamilyLooks?: { family: string; look: string }[];
};

export type LookBase = {
	id: string;
	family: string;
	modelGroup: string;
	alsoNpcs?: number[];
	npcs: NpcFactsBase[];
};

export type AbilityBase = { id: string };

export type Issue = {
	level: "error" | "warning";
	/** Path relative to data/, e.g. retail/looks/worg-black.json */
	file: string;
	/** Dotted key path inside the file, when known. */
	path?: string;
	message: string;
};

export type Dataset<
	F extends FamilyBase = FamilyBase,
	L extends LookBase = LookBase,
	A extends AbilityBase = AbilityBase,
> = {
	version: GameVersion;
	meta: VersionFacts;
	zones: Map<string, ZoneFacts>;
	abilities: Map<string, A>;
	/** Keyed by file name, which integrity checks require to equal the id. */
	families: Map<string, F>;
	looks: Map<string, L>;
	text: { base: BaseText; translations: Map<Locale, TranslationText> };
};

export type VersionDefinition<
	F extends FamilyBase = FamilyBase,
	L extends LookBase = LookBase,
	A extends AbilityBase = AbilityBase,
> = {
	id: GameVersion;
	family: z.ZodType<F>;
	look: z.ZodType<L>;
	ability: z.ZodType<A>;
	/** Every ability a family can use, in display order; must exist in abilities.json. */
	familyAbilityIds: (args: {
		family: F;
		abilities: Map<string, A>;
	}) => string[];
	/** Version-specific integrity rules, run after the shared ones. */
	check?: (dataset: Dataset<F, L, A>) => Issue[];
};

// biome-ignore lint/suspicious/noExplicitAny: definitions are invariant in their fact types
export type AnyVersionDefinition = VersionDefinition<any, any, any>;

export type DatasetOf<D> =
	D extends VersionDefinition<infer F, infer L, infer A>
		? Dataset<F, L, A>
		: never;

export function defineVersion<
	F extends FamilyBase,
	L extends LookBase,
	A extends AbilityBase,
>(definition: VersionDefinition<F, L, A>) {
	return definition;
}

const entityFile = /^(families|looks)\/([^/]+)\.json$/;
const localeFile = /^locales\/([^/]+)\/(.+)$/;

export function buildDataset<D extends AnyVersionDefinition>({
	definition,
	files,
}: {
	definition: D;
	files: Record<string, unknown>;
}): { dataset: DatasetOf<D>; issues: Issue[] } {
	const issues: Issue[] = [];
	const fileLabel = (relative: string) => `${definition.id}/${relative}`;

	function parse<T>(
		schema: z.ZodType<T>,
		relative: string,
		value: unknown,
	): T | undefined {
		const result = schema.safeParse(value);
		if (result.success) return result.data;
		for (const issue of result.error.issues) {
			issues.push({
				level: "error",
				file: fileLabel(relative),
				path: issue.path.join(".") || undefined,
				message: issue.message,
			});
		}
		return undefined;
	}

	function required(relative: string): unknown {
		if (!(relative in files)) {
			issues.push({
				level: "error",
				file: fileLabel(relative),
				message: "Missing required file",
			});
		}
		return files[relative];
	}

	function indexById<T extends { id: string }>(
		relative: string,
		items: T[] | undefined,
	) {
		const map = new Map<string, T>();
		for (const [index, item] of (items ?? []).entries()) {
			if (map.has(item.id)) {
				issues.push({
					level: "error",
					file: fileLabel(relative),
					path: String(index),
					message: `Duplicate id "${item.id}"`,
				});
			}
			map.set(item.id, item);
		}
		return map;
	}

	const meta = parse(versionFacts, "version.json", required("version.json"));
	if (meta && meta.id !== definition.id) {
		issues.push({
			level: "error",
			file: fileLabel("version.json"),
			path: "id",
			message: `Expected "${definition.id}"`,
		});
	}

	const zones = indexById(
		"zones.json",
		parse(
			zoneFacts.array() as z.ZodType<ZoneFacts[]>,
			"zones.json",
			required("zones.json"),
		),
	);
	const abilities = indexById(
		"abilities.json",
		parse(
			definition.ability.array() as z.ZodType<unknown[]>,
			"abilities.json",
			required("abilities.json"),
		) as AbilityBase[] | undefined,
	);

	const families = new Map<string, FamilyBase>();
	const looks = new Map<string, LookBase>();
	const localeFiles = new Map<Locale, Record<string, unknown>>();

	for (const [relative, value] of Object.entries(files)) {
		if (["version.json", "zones.json", "abilities.json"].includes(relative)) {
			continue;
		}
		const entity = entityFile.exec(relative);
		if (entity) {
			const [, kind, id] = entity;
			const parsed =
				kind === "families"
					? parse(definition.family, relative, value)
					: parse(definition.look, relative, value);
			if (parsed) {
				(kind === "families" ? families : looks).set(id, parsed);
			}
			continue;
		}
		const localized = localeFile.exec(relative);
		if (localized) {
			const [, locale, rest] = localized;
			if (!isLocale(locale)) {
				issues.push({
					level: "error",
					file: fileLabel(relative),
					message: `Unknown locale "${locale}" (expected one of ${locales.join(", ")})`,
				});
				continue;
			}
			const bucket = localeFiles.get(locale) ?? {};
			bucket[rest] = value;
			localeFiles.set(locale, bucket);
			continue;
		}
		issues.push({
			level: "error",
			file: fileLabel(relative),
			message: "Unexpected file; see the data layout in src/data/README.md",
		});
	}

	function parseText<M extends TextMode>(locale: Locale, mode: M) {
		const bucket = localeFiles.get(locale) ?? {};
		const prefix = `locales/${locale}/`;
		const text = {
			version: undefined as unknown,
			zones: undefined as unknown,
			abilities: undefined as unknown,
			families: new Map<string, unknown>(),
			looks: new Map<string, unknown>(),
		};
		for (const [rest, value] of Object.entries(bucket)) {
			const relative = prefix + rest;
			if (rest === "version.json") {
				text.version = parse(versionText(mode), relative, value);
			} else if (rest === "zones.json") {
				text.zones = parse(zonesText(mode), relative, value);
			} else if (rest === "abilities.json") {
				text.abilities = parse(abilitiesText(mode), relative, value);
			} else {
				const entity = entityFile.exec(rest);
				if (!entity) {
					issues.push({
						level: "error",
						file: fileLabel(relative),
						message: "Unexpected locale file",
					});
					continue;
				}
				const [, kind, id] = entity;
				const parsed =
					kind === "families"
						? parse(familyText(mode), relative, value)
						: parse(lookText(mode), relative, value);
				if (parsed) text[kind as "families" | "looks"].set(id, parsed);
			}
		}
		return text;
	}

	const base = parseText(baseLocale, "base");
	if (base.version === undefined) {
		issues.push({
			level: "error",
			file: fileLabel(`locales/${baseLocale}/version.json`),
			message: "Missing required file",
		});
	}
	const translations = new Map<Locale, TranslationText>();
	for (const locale of locales) {
		if (locale !== baseLocale) {
			translations.set(
				locale,
				parseText(locale, "translation") as TranslationText,
			);
		}
	}

	const dataset: Dataset = {
		version: definition.id,
		meta: meta ?? { id: definition.id },
		zones,
		abilities,
		families,
		looks,
		text: {
			base: {
				version: (base.version as BaseText["version"]) ?? {
					name: definition.id,
				},
				zones: (base.zones as BaseText["zones"]) ?? {},
				abilities: (base.abilities as BaseText["abilities"]) ?? {},
				families: base.families as BaseText["families"],
				looks: base.looks as BaseText["looks"],
			},
			translations,
		},
	};
	return { dataset: dataset as DatasetOf<D>, issues };
}
