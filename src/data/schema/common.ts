// Building blocks shared by every game version. Each version composes its own
// facts schemas from these (see retail.ts, classic.ts, forever.ts); text schemas
// are shared because every version translates the same kinds of strings.
import { z } from "zod";

export const slug = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case slug");

/** Numeric Blizzard ID (npc, spell, display, quest, creature family...). */
export const gameId = z.number().int().positive();

export const versionFacts = z.strictObject({
	id: slug,
	patch: z
		.string()
		.regex(/^\d+(?:\.\d+)*$/)
		.optional(),
	/** Wowhead root for this version, e.g. https://www.wowhead.com/classic */
	wowheadBase: z.url().optional(),
});

export const zoneFacts = z.strictObject({
	id: slug,
	wowId: gameId.optional(),
	kind: z.enum(["zone", "area", "city", "dungeon", "raid", "scenario"]),
	/** Areas point to the zone that contains them. */
	parent: slug.optional(),
});

export const levelRange = z
	.strictObject({
		min: z.number().int().positive(),
		max: z.number().int().positive(),
	})
	.refine((level) => level.min <= level.max, "min must be <= max");

export const classification = z.enum([
	"normal",
	"elite",
	"rare",
	"rare-elite",
	"boss",
]);

export const location = z.strictObject({
	zone: slug,
	area: slug.optional(),
	coords: z
		.array(
			z.strictObject({
				x: z.number().min(0).max(100),
				y: z.number().min(0).max(100),
			}),
		)
		.optional(),
});

/** Structured so the UI can phrase it in any locale; free-form detail goes in the NPC note. */
export const condition = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("quest"), questId: gameId.optional() }),
	z.strictObject({ kind: z.literal("invasion") }),
	z.strictObject({ kind: z.literal("summoned") }),
]);

export const npcFactsShape = {
	id: gameId,
	tameable: z.boolean(),
	level: levelRange.optional(),
	classification,
	locations: z.array(location).min(1),
	keepsName: z.boolean().optional(),
	conditions: z.array(condition).optional(),
};

export const lookFactsShape = {
	id: slug,
	family: slug,
	modelGroup: slug,
	displayIds: z.array(gameId).optional(),
	/** Patch that introduced the look, e.g. "5.0.4". */
	addedIn: z
		.string()
		.regex(/^\d+(?:\.\d+)*$/)
		.optional(),
	/** Overrides the /images/{version}/looks/{id}.webp convention. */
	image: z.string().optional(),
	/** NPCs defined in another look that can also show this one. */
	alsoNpcs: z.array(gameId).optional(),
};

export const modelGroupFacts = z.strictObject({ id: slug });

export const otherFamilyLook = z.strictObject({ family: slug, look: slug });

// ---------------------------------------------------------------------------
// Text. `base` is the English source of truth and must be complete;
// `translation` mirrors it with every string optional (falls back to English).

export type TextMode = "base" | "translation";

const requiredString = z.string().min(1);
const optionalString = requiredString.optional();
const numericKey = z.string().regex(/^\d+$/, "Expected an NPC id");

type Str<M extends TextMode> = M extends "base"
	? typeof requiredString
	: typeof optionalString;
type Maybe<M extends TextMode, T extends z.ZodType> = M extends "base"
	? T
	: z.ZodOptional<T>;

function str<M extends TextMode>(mode: M): Str<M> {
	return (mode === "base" ? requiredString : optionalString) as Str<M>;
}

function maybe<M extends TextMode, T extends z.ZodType>(
	mode: M,
	schema: T,
): Maybe<M, T> {
	return (mode === "base" ? schema : schema.optional()) as Maybe<M, T>;
}

export function versionText<M extends TextMode>(mode: M) {
	return z.strictObject({ name: str(mode) });
}

export function zonesText<M extends TextMode>(mode: M) {
	return z.record(slug, z.strictObject({ name: str(mode) }));
}

export function abilitiesText<M extends TextMode>(mode: M) {
	return z.record(
		slug,
		z.strictObject({
			name: str(mode),
			/** May contain {effect}, replaced by the rank's effect value. */
			description: optionalString,
		}),
	);
}

export function familyText<M extends TextMode>(mode: M) {
	return z.strictObject({
		name: str(mode),
		note: optionalString,
		modelGroups: maybe(
			mode,
			z.record(slug, z.strictObject({ name: str(mode), note: optionalString })),
		),
	});
}

export function lookText<M extends TextMode>(mode: M) {
	return z.strictObject({
		name: str(mode),
		variant: str(mode),
		note: optionalString,
		npcs: maybe(
			mode,
			z.record(
				numericKey,
				z.strictObject({
					name: str(mode),
					title: optionalString,
					note: optionalString,
				}),
			),
		),
	});
}

export type VersionFacts = z.infer<typeof versionFacts>;
export type ZoneFacts = z.infer<typeof zoneFacts>;
export type NpcFactsBase = z.infer<z.ZodObject<typeof npcFactsShape>>;
export type ModelGroupFacts = z.infer<typeof modelGroupFacts>;

type TextOf<M extends TextMode> = {
	version: z.infer<ReturnType<typeof versionText<M>>>;
	zones: z.infer<ReturnType<typeof zonesText<M>>>;
	abilities: z.infer<ReturnType<typeof abilitiesText<M>>>;
	families: Map<string, z.infer<ReturnType<typeof familyText<M>>>>;
	looks: Map<string, z.infer<ReturnType<typeof lookText<M>>>>;
};

/** English text for a version; every fact has a complete entry. */
export type BaseText = TextOf<"base">;

/** Another locale's text; any file or key may be missing. */
export type TranslationText = Partial<
	Pick<TextOf<"translation">, "version" | "zones" | "abilities">
> &
	Pick<TextOf<"translation">, "families" | "looks">;
