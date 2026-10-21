import { z } from "zod";
import {
	gameId,
	lookFactsShape,
	modelGroupFacts,
	npcFactsShape,
	otherFamilyLook,
	slug,
} from "./common";

export const classicAbility = z.strictObject({
	id: slug,
	kind: z.enum(["active", "passive"]),
	ranks: z
		.array(
			z.strictObject({
				rank: z.number().int().positive(),
				spellId: gameId.optional(),
				petLevel: z.number().int().positive(),
				tpCost: z.number().int().nonnegative(),
				/** `tame`: learned from a beast that knows it (see npc.abilities). */
				source: z.enum(["trainer", "tame"]),
				/** Language-neutral value substituted into the description's {effect}. */
				effect: z.string().optional(),
			}),
		)
		.min(1)
		.refine(
			(ranks) => ranks.every((r, index) => r.rank === index + 1),
			"Ranks must be listed in order starting at 1",
		),
});

export const classicFamily = z.strictObject({
	id: slug,
	wowId: gameId.optional(),
	/** Game icon file name, e.g. ability_hunter_pet_wolf. */
	icon: z.string().optional(),
	diet: z
		.array(z.enum(["meat", "fish", "fruit", "fungus", "bread", "cheese"]))
		.min(1),
	/** Multipliers applied to the pet's base stats. */
	stats: z.strictObject({
		health: z.number().positive(),
		armor: z.number().positive(),
		damage: z.number().positive(),
	}),
	abilities: z.strictObject({
		active: z.array(slug),
		passive: z.array(slug),
	}),
	modelGroups: z.array(modelGroupFacts).min(1),
	otherFamilyLooks: z.array(otherFamilyLook).optional(),
});

export const classicNpc = z.strictObject({
	...npcFactsShape,
	attackSpeed: z.number().positive().optional(),
	/** Abilities the beast knows; taming it teaches these ranks. */
	abilities: z
		.array(z.strictObject({ ability: slug, rank: z.number().int().positive() }))
		.optional(),
});

export const classicLook = z.strictObject({
	...lookFactsShape,
	npcs: z.array(classicNpc),
});

export type ClassicAbility = z.infer<typeof classicAbility>;
export type ClassicFamily = z.infer<typeof classicFamily>;
export type ClassicLook = z.infer<typeof classicLook>;
