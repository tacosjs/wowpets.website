// Imports every Retail hunter pet look from Petopia (facts only) plus official
// en/fr names from game data. Re-runnable: see ADR 0006 for the merge rules.
//   pnpm import:retail [--family wolf,aqiri]
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheRoot } from "./fetch.ts";
import { type GameData, loadGameData } from "./gamedata.ts";
import {
	type FamilyPage,
	fetchFamily,
	fetchFamilyIds,
	fetchLook,
	type LookPage,
	normalizeLookId,
	slugify,
} from "./petopia.ts";
import {
	dataPath,
	listJson,
	mergeFacts,
	readJson,
	stats,
	writeJson,
	writeText,
} from "./write.ts";

type Location = {
	zone: string;
	area?: string;
	coords?: { x: number; y: number }[];
};
type Condition = { kind: string; questId?: number };
type Npc = {
	id: number;
	tameable: boolean;
	level?: { min: number; max: number };
	classification: string;
	locations: Location[];
	keepsName?: boolean;
	retired?: boolean;
	conditions?: Condition[];
};
type Look = {
	id: string;
	family: string;
	modelGroup: string;
	npcs: Npc[];
	alsoNpcs?: number[];
};
type Family = {
	id: string;
	modelGroups: { id: string }[];
	otherFamilyLooks?: { family: string; look: string }[];
};
type Zone = { id: string; wowId?: number; kind: string; parent?: string };
type Ability = { id: string; spellId: number; kind: string };
type Named = Record<string, { name: string } | undefined>;

const abilityKinds: Record<string, string> = {
	common: "common",
	basicattack: "basic",
	family: "family",
	exotic: "exotic",
	special: "special",
	// Petopia's "Tricks" (e.g. Rest) are family-specific extras.
	tricks: "special",
};
const zoneKinds: Record<string, string> = {
	Dungeon: "dungeon",
	Raid: "raid",
	Scenario: "scenario",
	Battleground: "battleground",
	Warfront: "warfront",
};
/** Petopia disambiguates same-named zones by continent: "Nagrand - Draenor". */
const continents: Record<string, number> = { Outland: 530, Draenor: 1116 };

const familyFilter = (() => {
	const index = process.argv.indexOf("--family");
	return index >= 0 ? new Set(process.argv[index + 1]?.split(",")) : undefined;
})();

const report = {
	families: 0,
	looks: 0,
	npcs: 0,
	errors: [] as string[],
	warnings: [] as string[],
	unmatchedZones: new Set<string>(),
	unknownLevelTokens: new Set<string>(),
	stale: [] as string[],
	frNpcNames: { found: 0, total: 0 },
};

const majority = (values: number[]) => {
	const counts = new Map<number, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

const createResolvers = ({
	game,
	zones,
	abilities,
}: {
	game: GameData;
	zones: Map<string, Zone>;
	abilities: Map<number, Ability>;
}) => {
	const zoneText = { en: {} as Named, fr: {} as Named };
	const abilityText = { en: {} as Named, fr: {} as Named };
	const takenAbilityIds = new Set([...abilities.values()].map((a) => a.id));

	const upsertZone = (zone: Zone) => {
		const existing = zones.get(zone.id);
		const kind =
			existing && existing.kind !== "zone" ? existing.kind : zone.kind;
		zones.set(zone.id, mergeFacts(existing, { ...zone, kind }));
	};

	/** Classifies one "(…)" suffix of a location; undefined keeps it in the name. */
	const readSuffix = (suffix: string) => {
		if (zoneKinds[suffix]) return { kind: zoneKinds[suffix] };
		if (/non-instanced/i.test(suffix)) return undefined;
		if (/delve/i.test(suffix)) return { kind: "delve" };
		if (/dungeon/i.test(suffix)) return { kind: "dungeon" };
		if (/scenario|instance/i.test(suffix)) return { kind: "scenario" };
		if (/phase/i.test(suffix)) return { condition: "phase" };
		if (/^(not )?tameable$/i.test(suffix)) return {};
		return undefined;
	};

	/** One Petopia zone cell line: "Area, Zone (Kind); Other Zone & others". */
	const resolveLocations = (
		line: string,
	): { locations: Location[]; conditions: Condition[] } => {
		const locations: Location[] = [];
		const conditions: Condition[] = [];
		for (const segment of line.split(";")) {
			let name = segment.replace(/\s*&\s*others$/i, "").trim();
			let kind = "zone";
			const kept: string[] = [];
			for (
				let m = /^(.*?)\s*\(([^()]+)\)$/.exec(name);
				m;
				m = /^(.*?)\s*\(([^()]+)\)$/.exec(name)
			) {
				name = m[1];
				const read = readSuffix(m[2]);
				if (!read) kept.unshift(m[2]);
				else if (read.kind) kind = read.kind;
				else if (
					read.condition &&
					!conditions.some((c) => c.kind === read.condition)
				) {
					conditions.push({ kind: read.condition });
				}
			}
			const parts = name
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean);
			const zoneName = parts.at(-1);
			if (!zoneName) continue;
			// Suffixes we don't understand ("Broken Isles", "Classic") disambiguate zones.
			const zoneLabel = kept.length
				? `${zoneName} (${kept.join(") (")})`
				: zoneName;
			const continent = /^(.*) - (\w+)$/.exec(zoneName);
			const continentId = continent ? continents[continent[2]] : undefined;
			const lookupName = continentId && continent ? continent[1] : zoneName;
			const candidates = (
				game.areasByName.get(lookupName.toLowerCase()) ?? []
			).filter((row) => !continentId || row.continentId === continentId);
			const topLevel = candidates.filter((row) => row.parentId === 0);
			const zoneRow = topLevel[0] ?? candidates[0];
			// Several same-named zones: don't guess an id, names are still usable.
			const ambiguous = topLevel.length > 1;
			if (!zoneRow) report.unmatchedZones.add(zoneLabel);
			const zoneId = slugify(zoneLabel);
			upsertZone({
				id: zoneId,
				wowId: ambiguous ? undefined : zoneRow?.id,
				kind,
			});
			zoneText.en[zoneId] = {
				name:
					continentId || kept.length ? zoneLabel : (zoneRow?.en ?? zoneName),
			};
			if (zoneRow?.fr) zoneText.fr[zoneId] = { name: zoneRow.fr };

			const areaName = parts.length > 1 ? parts[0] : undefined;
			if (!areaName) {
				locations.push({ zone: zoneId });
				continue;
			}
			const areaRow = (game.areasByName.get(areaName.toLowerCase()) ?? []).find(
				(row) => zoneRow && !ambiguous && row.parentId === zoneRow.id,
			);
			let areaId = slugify(areaName);
			const clash = zones.get(areaId);
			if (clash && (clash.kind !== "area" || clash.parent !== zoneId)) {
				areaId = `${areaId}-${zoneId}`;
			}
			upsertZone({
				id: areaId,
				wowId: areaRow?.id,
				kind: "area",
				parent: zoneId,
			});
			zoneText.en[areaId] = { name: areaRow?.en ?? areaName };
			if (areaRow?.fr) zoneText.fr[areaId] = { name: areaRow.fr };
			locations.push({ zone: zoneId, area: areaId });
		}
		return { locations, conditions };
	};

	const resolveAbility = ({
		spellId,
		name,
		section,
	}: FamilyPage["abilities"][number]) => {
		const kind = abilityKinds[section];
		if (!kind) {
			report.errors.push(
				`Unknown ability section "${section}" for spell ${spellId}`,
			);
			return undefined;
		}
		let ability = abilities.get(spellId);
		if (!ability) {
			const gameName = game.spells.get(spellId)?.en ?? name;
			let id = slugify(gameName);
			if (takenAbilityIds.has(id)) id = `${id}-${spellId}`;
			takenAbilityIds.add(id);
			ability = { id, spellId, kind };
			abilities.set(spellId, ability);
		} else if (ability.kind !== kind) {
			report.warnings.push(
				`Spell ${spellId} listed as ${kind}, kept as ${ability.kind}`,
			);
		}
		const spell = game.spells.get(spellId);
		abilityText.en[ability.id] = { name: spell?.en ?? name };
		if (spell?.fr) abilityText.fr[ability.id] = { name: spell.fr };
		return ability;
	};

	return { resolveLocations, resolveAbility, zoneText, abilityText };
};

const buildNpc = ({
	row,
	resolveLocations,
}: {
	row: LookPage["npcs"][number];
	resolveLocations: (line: string) => {
		locations: Location[];
		conditions: Condition[];
	};
}): Npc => {
	let level: Npc["level"];
	let elite = false;
	let rare = false;
	let boss = false;
	let retired = false;
	const conditions: Condition[] = [];
	for (const token of row.levelTokens) {
		const range = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(token);
		const word = token.toLowerCase();
		if (range)
			level = { min: Number(range[1]), max: Number(range[2] ?? range[1]) };
		else if (word === "elite") elite = true;
		else if (word === "rare") rare = true;
		else if (word === "rare elite") rare = elite = true;
		else if (word === "boss") boss = true;
		else if (word === "spawned") conditions.push({ kind: "summoned" });
		else if (word === "retired") retired = true;
		else report.unknownLevelTokens.add(token);
	}
	const classification = boss
		? "boss"
		: rare && elite
			? "rare-elite"
			: rare
				? "rare"
				: elite
					? "elite"
					: "normal";
	const locations: Location[] = [];
	for (const resolved of row.zoneLines.map(resolveLocations)) {
		locations.push(...resolved.locations);
		for (const condition of resolved.conditions) {
			if (!conditions.some((c) => c.kind === condition.kind))
				conditions.push(condition);
		}
	}
	return {
		id: row.id,
		tameable: row.tameable,
		level,
		classification,
		locations,
		keepsName: row.keepsName || undefined,
		retired: retired || undefined,
		conditions: conditions.length ? conditions : undefined,
	};
};

/** Imported facts win, but hand-added coords and conditions survive. */
const mergeNpc = (existing: Npc | undefined, imported: Npc): Npc => {
	if (!existing) return imported;
	const merged = mergeFacts(existing, imported);
	merged.locations = imported.locations.map((location) => {
		const old = existing.locations.find(
			(o) => o.zone === location.zone && o.area === location.area,
		);
		return old?.coords ? { ...location, coords: old.coords } : location;
	});
	const conditions = [...(existing.conditions ?? [])];
	for (const condition of imported.conditions ?? []) {
		if (!conditions.some((c) => c.kind === condition.kind))
			conditions.push(condition);
	}
	if (conditions.length) merged.conditions = conditions;
	return merged;
};

const main = async () => {
	const game = await loadGameData();
	const allFamilyIds = await fetchFamilyIds();
	const familyIds = allFamilyIds.filter(
		(id) => !familyFilter || familyFilter.has(id),
	);
	for (const id of familyFilter ?? []) {
		if (!allFamilyIds.includes(id))
			report.errors.push(`Unknown family "${id}"`);
	}

	const zones = new Map(
		((await readJson<Zone[]>(dataPath("retail", "zones.json"))) ?? []).map(
			(z) => [z.id, z],
		),
	);
	const abilities = new Map(
		(
			(await readJson<Ability[]>(dataPath("retail", "abilities.json"))) ?? []
		).map((a) => [a.spellId, a]),
	);
	const existingLooks = new Map<string, Look>();
	for (const id of await listJson(dataPath("retail", "looks"))) {
		const look = await readJson<Look>(
			dataPath("retail", "looks", `${id}.json`),
		);
		if (look) existingLooks.set(id, look);
	}
	const npcHome = new Map<number, string>();
	for (const look of existingLooks.values()) {
		for (const npc of look.npcs) npcHome.set(npc.id, look.id);
	}
	const { resolveLocations, resolveAbility, zoneText, abilityText } =
		createResolvers({
			game,
			zones,
			abilities,
		});

	// Pass 1: fetch every family page and the pages of the looks it owns.
	const pages: { family: FamilyPage; looks: Map<string, LookPage> }[] = [];
	const lookOwner = new Map<string, string>();
	const petopiaIdFor = new Map<string, string>();
	for (const [index, familyId] of familyIds.entries()) {
		console.info(`[${index + 1}/${familyIds.length}] ${familyId}`);
		const family = await fetchFamily(familyId);
		const looks = new Map<string, LookPage>();
		for (const ref of family.modelGroups.flatMap((group) => group.looks)) {
			if (ref.section !== "regular" && ref.section !== "untameable") continue;
			const id = normalizeLookId(ref.petopiaId);
			const clash = petopiaIdFor.get(id);
			if (clash && clash !== ref.petopiaId) {
				report.errors.push(
					`Look ids "${clash}" and "${ref.petopiaId}" both normalize to "${id}"`,
				);
				continue;
			}
			if (lookOwner.has(id)) {
				report.warnings.push(
					`Look ${id} listed by ${lookOwner.get(id)} and ${familyId}; kept in ${lookOwner.get(id)}`,
				);
				continue;
			}
			petopiaIdFor.set(id, ref.petopiaId);
			lookOwner.set(id, familyId);
			looks.set(ref.petopiaId, await fetchLook(ref.petopiaId));
		}
		pages.push({ family, looks });
		console.info(
			`${familyId}: ${family.modelGroups.length} model groups, ${looks.size} looks`,
		);
	}

	// Pass 2: build and write looks, collect family facts.
	const familyFacts = new Map<string, Family & Record<string, unknown>>();
	for (const { family, looks } of pages) {
		const creatureFamilies: number[] = [];
		const otherFamilyLooks: { family: string; look: string }[] = [];
		for (const group of family.modelGroups) {
			for (const ref of group.looks) {
				const id = normalizeLookId(ref.petopiaId);
				if (ref.section === "otherfamily") {
					const owner = lookOwner.get(id);
					if (owner && owner !== family.id)
						otherFamilyLooks.push({ family: owner, look: id });
					else if (!owner && !familyFilter)
						report.warnings.push(
							`${family.id}: other-family look ${id} has no owner`,
						);
					continue;
				}
				const page = looks.get(ref.petopiaId);
				if (!page) continue;
				const existing = existingLooks.get(id);
				const npcs: Npc[] = [];
				const also = new Set(existing?.alsoNpcs ?? []);
				const enNpcs: Record<string, { name: string; title?: string }> = {};
				const frNpcs: Record<string, { name: string; title?: string }> = {};
				for (const row of page.npcs) {
					const home = npcHome.get(row.id) ?? id;
					npcHome.set(row.id, home);
					if (home !== id) {
						also.add(row.id);
						continue;
					}
					const imported = buildNpc({ row, resolveLocations });
					const duplicate = npcs.find((npc) => npc.id === row.id);
					if (duplicate) {
						duplicate.locations.push(...imported.locations);
						continue;
					}
					if (imported.locations.length === 0) {
						report.warnings.push(`${id}: NPC ${row.id} has no location`);
					}
					npcs.push(
						mergeNpc(
							existing?.npcs.find((npc) => npc.id === row.id),
							imported,
						),
					);
					enNpcs[row.id] = { name: row.name, title: row.title };
					const creature = game.creatures.get(row.id);
					report.frNpcNames.total++;
					if (creature?.frName) {
						report.frNpcNames.found++;
						frNpcs[row.id] = {
							name: creature.frName,
							title: row.title ? creature.frTitle : undefined,
						};
					}
					if (creature?.family) creatureFamilies.push(creature.family);
				}
				for (const npc of existing?.npcs ?? []) {
					if (!npcs.some((n) => n.id === npc.id) && !also.has(npc.id)) {
						npcs.push(npc);
						report.stale.push(`looks/${id}.json: NPC ${npc.id} not on Petopia`);
					}
				}
				const facts = mergeFacts(existing, {
					id,
					family: family.id,
					modelGroup: group.id,
					npcs,
					alsoNpcs: also.size ? [...also] : undefined,
				});
				await writeJson({
					path: dataPath("retail", "looks", `${id}.json`),
					data: facts,
				});
				await writeText({
					path: dataPath("retail", "locales", "en", "looks", `${id}.json`),
					data: { name: ref.name, variant: ref.variant, npcs: enNpcs },
				});
				if (Object.keys(frNpcs).length) {
					await writeText({
						path: dataPath("retail", "locales", "fr", "looks", `${id}.json`),
						data: { npcs: frNpcs },
					});
				}
				report.looks++;
				report.npcs += npcs.length;
			}
		}

		const resolved = family.abilities.flatMap((a) => resolveAbility(a) ?? []);
		const basic = resolved.filter((a) => a.kind === "basic");
		if (basic.length !== 1) {
			report.errors.push(
				`${family.id}: expected 1 basic attack, found ${basic.length}`,
			);
		}
		const wowId = majority(creatureFamilies);
		const existing = await readJson<Family>(
			dataPath("retail", "families", `${family.id}.json`),
		);
		const groupIds = family.modelGroups.map((g) => g.id);
		const keptGroups = (existing?.modelGroups ?? []).filter(
			(g) => !groupIds.includes(g.id),
		);
		const otherLooks = [...(existing?.otherFamilyLooks ?? [])];
		for (const ref of otherFamilyLooks) {
			if (!otherLooks.some((o) => o.look === ref.look)) otherLooks.push(ref);
		}
		familyFacts.set(
			family.id,
			mergeFacts(existing, {
				id: family.id,
				wowId,
				icon: family.icon,
				spec: family.spec.toLowerCase(),
				exotic: family.exotic,
				requiredSkill: family.requiredSkill,
				diet: family.diet.map(slugify),
				abilities: {
					basic: basic[0]?.id,
					family: resolved
						.filter((a) => !["common", "basic"].includes(a.kind))
						.map((a) => a.id),
				},
				modelGroups: [...groupIds.map((id) => ({ id })), ...keptGroups],
				otherFamilyLooks: otherLooks.length ? otherLooks : undefined,
			}),
		);
		const gameFamily = wowId ? game.families.get(wowId) : undefined;
		await writeText({
			path: dataPath(
				"retail",
				"locales",
				"en",
				"families",
				`${family.id}.json`,
			),
			data: {
				name: gameFamily?.en ?? family.name,
				modelGroups: Object.fromEntries(
					family.modelGroups.map((g) => [g.id, { name: g.name }]),
				),
			},
		});
		if (gameFamily?.fr) {
			await writeText({
				path: dataPath(
					"retail",
					"locales",
					"fr",
					"families",
					`${family.id}.json`,
				),
				data: { name: gameFamily.fr },
			});
		}
		report.families++;
	}

	for (const [id, facts] of familyFacts) {
		await writeJson({
			path: dataPath("retail", "families", `${id}.json`),
			data: facts,
		});
	}

	// zones.json is an index of the looks' locations: drop entries no look uses.
	const usedZones = new Set<string>();
	for (const id of await listJson(dataPath("retail", "looks"))) {
		const look = await readJson<Look>(
			dataPath("retail", "looks", `${id}.json`),
		);
		for (const location of (look?.npcs ?? []).flatMap((npc) => npc.locations)) {
			usedZones.add(location.zone);
			if (location.area) usedZones.add(location.area);
		}
	}
	for (const id of [...zones.keys()]) {
		if (!usedZones.has(id)) zones.delete(id);
	}
	for (const locale of ["en", "fr"] as const) {
		const path = dataPath("retail", "locales", locale, "zones.json");
		const text = (await readJson<Named>(path)) ?? {};
		const kept = Object.fromEntries(
			Object.entries(text).filter(([id]) => usedZones.has(id)),
		);
		if (Object.keys(kept).length !== Object.keys(text).length)
			await writeJson({ path, data: kept });
	}
	await writeJson({
		path: dataPath("retail", "zones.json"),
		data: [...zones.values()],
	});
	await writeJson({
		path: dataPath("retail", "abilities.json"),
		data: [...abilities.values()],
	});
	for (const locale of ["en", "fr"] as const) {
		await writeText({
			path: dataPath("retail", "locales", locale, "zones.json"),
			data: zoneText[locale],
		});
		await writeText({
			path: dataPath("retail", "locales", locale, "abilities.json"),
			data: abilityText[locale],
		});
	}

	if (!familyFilter) {
		for (const id of existingLooks.keys()) {
			if (!lookOwner.has(id))
				report.stale.push(`looks/${id}.json not on Petopia`);
		}
	}

	const summary = {
		...report,
		zones: zones.size,
		abilities: abilities.size,
		files: stats,
		unmatchedZones: [...report.unmatchedZones].sort(),
		unknownLevelTokens: [...report.unknownLevelTokens].sort(),
	};
	await mkdir(cacheRoot, { recursive: true });
	await writeFile(
		join(cacheRoot, "retail-report.json"),
		`${JSON.stringify(summary, null, "\t")}\n`,
	);
	console.info(
		[
			`families ${summary.families}, looks ${summary.looks}, npcs ${summary.npcs}, zones ${summary.zones}, abilities ${summary.abilities}`,
			`files written ${stats.written}, unchanged ${stats.unchanged}`,
			`fr NPC names ${report.frNpcNames.found}/${report.frNpcNames.total}`,
			`unmatched zones ${summary.unmatchedZones.length}, unknown level tokens ${summary.unknownLevelTokens.length}, stale ${report.stale.length}, warnings ${report.warnings.length}`,
			...report.errors.map((e) => `ERROR ${e}`),
			`report: ${join(cacheRoot, "retail-report.json")}`,
		].join("\n"),
	);
	if (report.errors.length) process.exitCode = 1;
};

await main();
