import {
	type AnyVersionDefinition,
	defineVersion,
	type GameVersion,
	type Issue,
} from "./dataset";
import { classicAbility, classicFamily, classicLook } from "./schema/classic";
import { foreverAbility, foreverFamily, foreverLook } from "./schema/forever";
import { retailAbility, retailFamily, retailLook } from "./schema/retail";

const retail = defineVersion({
	id: "retail",
	family: retailFamily,
	look: retailLook,
	ability: retailAbility,
	familyAbilityIds: ({ family, abilities }) => [
		...[...abilities.values()]
			.filter((ability) => ability.kind === "common")
			.map((ability) => ability.id),
		family.abilities.basic,
		...family.abilities.family,
	],
	check: (dataset) => {
		const issues: Issue[] = [];
		for (const [fileId, family] of dataset.families) {
			const file = `retail/families/${fileId}.json`;
			const basic = dataset.abilities.get(family.abilities.basic);
			if (basic && basic.kind !== "basic") {
				issues.push({
					level: "error",
					file,
					path: "abilities.basic",
					message: `"${basic.id}" is a ${basic.kind} ability, not basic`,
				});
			}
			for (const [index, id] of family.abilities.family.entries()) {
				const ability = dataset.abilities.get(id);
				if (ability && ["common", "basic"].includes(ability.kind)) {
					issues.push({
						level: "error",
						file,
						path: `abilities.family.${index}`,
						message: `"${id}" is a ${ability.kind} ability`,
					});
				}
			}
		}
		return issues;
	},
});

const classic = defineVersion({
	id: "classic",
	family: classicFamily,
	look: classicLook,
	ability: classicAbility,
	familyAbilityIds: ({ family }) => [
		...family.abilities.active,
		...family.abilities.passive,
	],
	check: (dataset) => {
		const issues: Issue[] = [];
		for (const [fileId, family] of dataset.families) {
			for (const kind of ["active", "passive"] as const) {
				for (const [index, id] of family.abilities[kind].entries()) {
					const ability = dataset.abilities.get(id);
					if (ability && ability.kind !== kind) {
						issues.push({
							level: "error",
							file: `classic/families/${fileId}.json`,
							path: `abilities.${kind}.${index}`,
							message: `"${id}" is ${ability.kind}, not ${kind}`,
						});
					}
				}
			}
		}
		// A beast can only teach ranks its family learns by taming.
		for (const [fileId, look] of dataset.looks) {
			const family = dataset.families.get(look.family);
			const learnable = new Set([
				...(family?.abilities.active ?? []),
				...(family?.abilities.passive ?? []),
			]);
			for (const [npcIndex, npc] of look.npcs.entries()) {
				for (const [index, known] of (npc.abilities ?? []).entries()) {
					const path = `npcs.${npcIndex}.abilities.${index}`;
					const file = `classic/looks/${fileId}.json`;
					const rank = dataset.abilities
						.get(known.ability)
						?.ranks.find((r) => r.rank === known.rank);
					if (!dataset.abilities.has(known.ability)) {
						issues.push({
							level: "error",
							file,
							path,
							message: `Unknown ability "${known.ability}"`,
						});
					} else if (family && !learnable.has(known.ability)) {
						issues.push({
							level: "error",
							file,
							path,
							message: `"${look.family}" can't learn "${known.ability}"`,
						});
					} else if (!rank) {
						issues.push({
							level: "error",
							file,
							path,
							message: `"${known.ability}" has no rank ${known.rank}`,
						});
					} else if (rank.source !== "tame") {
						issues.push({
							level: "error",
							file,
							path,
							message: `"${known.ability}" rank ${known.rank} is learned from a trainer`,
						});
					}
				}
			}
		}
		return issues;
	},
});

const forever = defineVersion({
	id: "forever",
	family: foreverFamily,
	look: foreverLook,
	ability: foreverAbility,
	familyAbilityIds: ({ family }) => [
		...(family.abilities.family ? [family.abilities.family] : []),
		...family.abilities.active,
		...family.abilities.passive,
	],
});

export const versionDefinitions = { retail, classic, forever } satisfies Record<
	GameVersion,
	AnyVersionDefinition
>;

export type VersionDefinitions = typeof versionDefinitions;
