// Server functions: the only way routes read data. The locale is passed in
// explicitly because server-function requests don't carry the page URL.
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { locales } from "#/paraglide/runtime";
import {
	type AbilityBase,
	type AnyVersionDefinition,
	type Dataset,
	type FamilyBase,
	type GameVersion,
	isGameVersion,
	type LookBase,
	type VersionDefinition,
} from "./dataset";
import { getDataset } from "./load.server";
import { type VersionDefinitions, versionDefinitions } from "./versions";
import { familyView, listFamiliesView, lookView, npcView } from "./views";

type Facts<V extends GameVersion> =
	VersionDefinitions[V] extends VersionDefinition<infer F, infer L, infer A>
		? { family: F; look: L; ability: A }
		: never;
type FamilyIn<V extends GameVersion> = Facts<V>["family"];
type LookIn<V extends GameVersion> = Facts<V>["look"];
type AbilityIn<V extends GameVersion> = Facts<V>["ability"];

/** Each page type is a union over versions, discriminated by `versionId`. */
export type FamiliesPage = {
	[V in GameVersion]: { versionId: V } & ReturnType<
		typeof listFamiliesView<FamilyIn<V>>
	>;
}[GameVersion];
export type FamilyPage = {
	[V in GameVersion]: { versionId: V } & NonNullable<
		ReturnType<typeof familyView<FamilyIn<V>, LookIn<V>, AbilityIn<V>>>
	>;
}[GameVersion];
export type LookPage = {
	[V in GameVersion]: { versionId: V } & NonNullable<
		ReturnType<typeof lookView<FamilyIn<V>, LookIn<V>>>
	>;
}[GameVersion];
export type NpcPage = {
	[V in GameVersion]: { versionId: V } & NonNullable<
		ReturnType<typeof npcView<FamilyIn<V>, LookIn<V>>>
	>;
}[GameVersion];

const versionInput = z.object({ version: z.string(), locale: z.enum(locales) });
const entityInput = versionInput.extend({ id: z.string() });

function resolve(version: string) {
	if (!isGameVersion(version)) throw notFound();
	return {
		versionId: version,
		dataset: getDataset(version) as Dataset<FamilyBase, LookBase, AbilityBase>,
		definition: versionDefinitions[version] as AnyVersionDefinition,
	};
}

export const getFamilies = createServerFn({ method: "GET" })
	.validator(versionInput)
	.handler(({ data }): FamiliesPage => {
		const { versionId, dataset } = resolve(data.version);
		return {
			versionId,
			...listFamiliesView({ dataset, locale: data.locale }),
		} as FamiliesPage;
	});

export const getFamily = createServerFn({ method: "GET" })
	.validator(entityInput)
	.handler(({ data }): FamilyPage => {
		const { versionId, dataset, definition } = resolve(data.version);
		const view = familyView({
			dataset,
			familyId: data.id,
			locale: data.locale,
			abilityIds: (family) =>
				definition.familyAbilityIds({ family, abilities: dataset.abilities }),
		});
		if (!view) throw notFound();
		return { versionId, ...view } as FamilyPage;
	});

export const getLook = createServerFn({ method: "GET" })
	.validator(entityInput)
	.handler(({ data }): LookPage => {
		const { versionId, dataset } = resolve(data.version);
		const view = lookView({ dataset, lookId: data.id, locale: data.locale });
		if (!view) throw notFound();
		return { versionId, ...view } as LookPage;
	});

export const getNpc = createServerFn({ method: "GET" })
	.validator(entityInput)
	.handler(({ data }): NpcPage => {
		const { versionId, dataset } = resolve(data.version);
		const npcId = Number(data.id);
		const view = Number.isInteger(npcId)
			? npcView({ dataset, npcId, locale: data.locale })
			: undefined;
		if (!view) throw notFound();
		return { versionId, ...view } as NpcPage;
	});
