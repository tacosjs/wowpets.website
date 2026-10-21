import { z } from "zod";
import {
	gameId,
	lookFactsShape,
	modelGroupFacts,
	npcFactsShape,
	otherFamilyLook,
	slug,
} from "./common";

export const retailAbility = z.strictObject({
	id: slug,
	spellId: gameId,
	/** `common` abilities are available to every family. */
	kind: z.enum(["common", "basic", "family", "exotic", "special"]),
});

export const retailFamily = z.strictObject({
	id: slug,
	/** Blizzard creature family id. */
	wowId: gameId.optional(),
	/** Game icon file name, e.g. ability_hunter_pet_wolf. */
	icon: z.string().optional(),
	spec: z.enum(["ferocity", "tenacity", "cunning"]),
	exotic: z.boolean(),
	/** Extra hunter skill needed to tame, e.g. "mechanical". */
	requiredSkill: slug.optional(),
	diet: z
		.array(
			z.enum([
				"meat",
				"fish",
				"fruit",
				"fungus",
				"bread",
				"cheese",
				"raw-meat",
				"raw-fish",
				"mechanical-bits",
			]),
		)
		.min(1),
	abilities: z.strictObject({ basic: slug, family: z.array(slug) }),
	modelGroups: z.array(modelGroupFacts).min(1),
	otherFamilyLooks: z.array(otherFamilyLook).optional(),
});

export const retailNpc = z.strictObject(npcFactsShape);

export const retailLook = z.strictObject({
	...lookFactsShape,
	npcs: z.array(retailNpc),
});

export type RetailAbility = z.infer<typeof retailAbility>;
export type RetailFamily = z.infer<typeof retailFamily>;
export type RetailLook = z.infer<typeof retailLook>;
