// WoW: Forever (patch 1.60) builds on a 1.x base but adds unique family
// abilities and new families. Its pet rules aren't published yet, so this is a
// starting point kept independent from classic.ts so the two can diverge.
import { z } from "zod";
import {
	gameId,
	lookFactsShape,
	modelGroupFacts,
	npcFactsShape,
	otherFamilyLook,
	slug,
} from "./common";

export const foreverAbility = z.strictObject({
	id: slug,
	spellId: gameId.optional(),
	kind: z.enum(["active", "passive", "family"]),
});

export const foreverFamily = z.strictObject({
	id: slug,
	wowId: gameId.optional(),
	/** Game icon file name, e.g. ability_hunter_pet_wolf. */
	icon: z.string().optional(),
	diet: z
		.array(z.enum(["meat", "fish", "fruit", "fungus", "bread", "cheese"]))
		.min(1),
	abilities: z.strictObject({
		family: slug.optional(),
		active: z.array(slug),
		passive: z.array(slug),
	}),
	modelGroups: z.array(modelGroupFacts).min(1),
	otherFamilyLooks: z.array(otherFamilyLook).optional(),
});

export const foreverNpc = z.strictObject(npcFactsShape);

export const foreverLook = z.strictObject({
	...lookFactsShape,
	npcs: z.array(foreverNpc),
});

export type ForeverAbility = z.infer<typeof foreverAbility>;
export type ForeverFamily = z.infer<typeof foreverFamily>;
export type ForeverLook = z.infer<typeof foreverLook>;
