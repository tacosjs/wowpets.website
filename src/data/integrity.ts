// Cross-file rules that a single file's schema can't express: references must
// resolve, every fact has English text, and locale files only name real facts.
import { baseLocale } from "#/paraglide/runtime";
import type {
	AnyVersionDefinition,
	Dataset,
	DatasetOf,
	Issue,
	Locale,
} from "./dataset";
import type { BaseText, TranslationText } from "./schema/common";

export function checkIntegrity<D extends AnyVersionDefinition>({
	definition,
	dataset,
}: {
	definition: D;
	dataset: DatasetOf<D>;
}): Issue[] {
	const ds = dataset as Dataset;
	const v = ds.version;
	const issues: Issue[] = [];
	const error = (file: string, message: string, path?: string) =>
		issues.push({ level: "error", file: `${v}/${file}`, path, message });

	for (const [id, zone] of ds.zones) {
		if (zone.parent && !ds.zones.has(zone.parent)) {
			error("zones.json", `Zone "${id}" has unknown parent "${zone.parent}"`);
		}
		if (zone.kind === "area" && !zone.parent) {
			error("zones.json", `Area "${id}" needs a parent zone`);
		}
	}

	for (const [fileId, family] of ds.families) {
		const file = `families/${fileId}.json`;
		if (family.id !== fileId) error(file, `Expected id "${fileId}"`, "id");
		const abilityIds = definition.familyAbilityIds({
			family,
			abilities: ds.abilities,
		});
		for (const abilityId of abilityIds) {
			if (!ds.abilities.has(abilityId)) {
				error(file, `Unknown ability "${abilityId}"`, "abilities");
			}
		}
		for (const [index, ref] of (family.otherFamilyLooks ?? []).entries()) {
			const look = ds.looks.get(ref.look);
			if (!ds.families.has(ref.family) || !look || look.family !== ref.family) {
				error(
					file,
					`No look "${ref.look}" in family "${ref.family}"`,
					`otherFamilyLooks.${index}`,
				);
			}
		}
	}

	const npcHome = new Map<number, string>();
	for (const [fileId, look] of ds.looks) {
		const file = `looks/${fileId}.json`;
		if (look.id !== fileId) error(file, `Expected id "${fileId}"`, "id");
		const family = ds.families.get(look.family);
		if (!family) {
			error(file, `Unknown family "${look.family}"`, "family");
		} else if (!family.modelGroups.some((g) => g.id === look.modelGroup)) {
			error(
				file,
				`Family "${look.family}" has no model group "${look.modelGroup}"`,
				"modelGroup",
			);
		}
		for (const [npcIndex, npc] of look.npcs.entries()) {
			const home = npcHome.get(npc.id);
			if (home) {
				error(
					file,
					`NPC ${npc.id} is already defined in looks/${home}.json; reference it with alsoNpcs`,
					`npcs.${npcIndex}.id`,
				);
			}
			npcHome.set(npc.id, fileId);
			for (const [index, location] of npc.locations.entries()) {
				const path = `npcs.${npcIndex}.locations.${index}`;
				if (!ds.zones.has(location.zone)) {
					error(file, `Unknown zone "${location.zone}"`, `${path}.zone`);
				}
				if (location.area) {
					const area = ds.zones.get(location.area);
					if (!area) {
						error(file, `Unknown area "${location.area}"`, `${path}.area`);
					} else if (area.parent !== location.zone) {
						error(
							file,
							`Area "${location.area}" is not inside "${location.zone}"`,
							`${path}.area`,
						);
					}
				}
			}
		}
	}
	for (const [fileId, look] of ds.looks) {
		for (const [index, npcId] of (look.alsoNpcs ?? []).entries()) {
			const home = npcHome.get(npcId);
			if (!home || home === fileId) {
				error(
					`looks/${fileId}.json`,
					home
						? `NPC ${npcId} is already in this look`
						: `Unknown NPC ${npcId}`,
					`alsoNpcs.${index}`,
				);
			}
		}
	}

	issues.push(...checkText({ dataset: ds }));
	issues.push(...(definition.check?.(dataset) ?? []));
	return issues;
}

/** The keys each text file may contain, derived from the facts. */
function expectedText(ds: Dataset) {
	return {
		zones: new Set(ds.zones.keys()),
		abilities: new Set(ds.abilities.keys()),
		families: new Map(
			[...ds.families].map(([id, f]) => [
				id,
				new Set(f.modelGroups.map((g) => g.id)),
			]),
		),
		looks: new Map(
			[...ds.looks].map(([id, l]) => [
				id,
				new Set(l.npcs.map((npc) => String(npc.id))),
			]),
		),
	};
}

function checkText({ dataset: ds }: { dataset: Dataset }): Issue[] {
	const issues: Issue[] = [];
	const expected = expectedText(ds);

	function checkLocale(locale: Locale, text: BaseText | TranslationText) {
		const isBase = locale === baseLocale;
		const dir = `${ds.version}/locales/${locale}`;
		const error = (file: string, message: string, path?: string) =>
			issues.push({ level: "error", file: `${dir}/${file}`, path, message });

		function checkKeys(
			file: string,
			actual: Record<string, unknown> | undefined,
			allowed: Set<string>,
			what: string,
			prefix?: string,
		) {
			for (const key of Object.keys(actual ?? {})) {
				if (!allowed.has(key)) {
					error(
						file,
						`Unknown ${what} "${key}"`,
						prefix ? `${prefix}.${key}` : key,
					);
				}
			}
			if (!isBase) return;
			for (const key of allowed) {
				if (!actual?.[key]) {
					error(
						file,
						`Missing text for ${what} "${key}"`,
						prefix ? `${prefix}.${key}` : key,
					);
				}
			}
		}

		checkKeys("zones.json", text.zones, expected.zones, "zone");
		checkKeys("abilities.json", text.abilities, expected.abilities, "ability");

		for (const [id, groups] of expected.families) {
			const file = `families/${id}.json`;
			const familyText = text.families.get(id);
			if (!familyText) {
				if (isBase) error(file, "Missing text file");
				continue;
			}
			checkKeys(
				file,
				familyText.modelGroups,
				groups,
				"model group",
				"modelGroups",
			);
		}
		for (const id of text.families.keys()) {
			if (!expected.families.has(id)) {
				error(
					`families/${id}.json`,
					`No family "${id}" in ${ds.version}/families/`,
				);
			}
		}

		for (const [id, npcs] of expected.looks) {
			const file = `looks/${id}.json`;
			const lookText = text.looks.get(id);
			if (!lookText) {
				if (isBase) error(file, "Missing text file");
				continue;
			}
			checkKeys(file, lookText.npcs, npcs, "NPC", "npcs");
		}
		for (const id of text.looks.keys()) {
			if (!expected.looks.has(id)) {
				error(`looks/${id}.json`, `No look "${id}" in ${ds.version}/looks/`);
			}
		}
	}

	checkLocale(baseLocale, ds.text.base);
	for (const [locale, text] of ds.text.translations) checkLocale(locale, text);

	for (const coverage of translationCoverage({ dataset: ds })) {
		if (coverage.translated < coverage.total) {
			issues.push({
				level: "warning",
				file: `${ds.version}/locales/${coverage.locale}`,
				message: `${coverage.translated}/${coverage.total} strings translated`,
			});
		}
	}
	return issues;
}

function countStrings(base: unknown, translation: unknown): [number, number] {
	if (typeof base === "string") {
		return [typeof translation === "string" ? 1 : 0, 1];
	}
	if (base instanceof Map) {
		const other = translation instanceof Map ? translation : new Map();
		return sum(
			[...base].map(([key, value]) => countStrings(value, other.get(key))),
		);
	}
	if (typeof base === "object" && base !== null) {
		const other = (translation ?? {}) as Record<string, unknown>;
		return sum(
			Object.entries(base).map(([key, value]) =>
				countStrings(value, other[key]),
			),
		);
	}
	return [0, 0];
}

function sum(pairs: [number, number][]): [number, number] {
	return pairs.reduce<[number, number]>(
		([a, b], [c, d]) => [a + c, b + d],
		[0, 0],
	);
}

/** How many English strings each other locale translates. */
export function translationCoverage({ dataset }: { dataset: Dataset }) {
	return [...dataset.text.translations].map(([locale, translation]) => {
		const [translated, total] = countStrings(dataset.text.base, translation);
		return { version: dataset.version, locale, translated, total };
	});
}
