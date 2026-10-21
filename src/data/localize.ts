import { baseLocale } from "#/paraglide/runtime";
import type { Dataset, Locale } from "./dataset";
import type { BaseText } from "./schema/common";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges a translation over the English base, key by key. Only keys present
 * in the base are kept, so the result always has the base's shape.
 */
export function mergeText<T>({
	base,
	translation,
}: {
	base: T;
	translation: unknown;
}): T {
	if (translation === undefined || translation === null) return base;
	if (typeof base === "string") {
		return (typeof translation === "string" ? translation : base) as T;
	}
	if (isPlainObject(base) && isPlainObject(translation)) {
		const merged: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(base)) {
			merged[key] = mergeText({ base: value, translation: translation[key] });
		}
		// Optional keys (notes, titles) may exist only in the translation.
		for (const [key, value] of Object.entries(translation)) {
			if (!(key in merged) && typeof value === "string") merged[key] = value;
		}
		return merged as T;
	}
	return base;
}

function mergeMap<V>(base: Map<string, V>, translation: Map<string, unknown>) {
	const merged = new Map<string, V>();
	for (const [key, value] of base) {
		merged.set(
			key,
			mergeText({ base: value, translation: translation.get(key) }),
		);
	}
	return merged;
}

const cache = new WeakMap<Dataset, Map<Locale, BaseText>>();

/** All of a version's text in one locale, English filling any gap. */
export function textFor({
	dataset,
	locale,
}: {
	dataset: Dataset;
	locale: Locale;
}): BaseText {
	const { base, translations } = dataset.text;
	const translation = translations.get(locale);
	if (locale === baseLocale || !translation) return base;

	const perDataset = cache.get(dataset) ?? new Map<Locale, BaseText>();
	cache.set(dataset, perDataset);
	const cached = perDataset.get(locale);
	if (cached) return cached;

	const merged: BaseText = {
		version: mergeText({
			base: base.version,
			translation: translation.version,
		}),
		zones: mergeText({ base: base.zones, translation: translation.zones }),
		abilities: mergeText({
			base: base.abilities,
			translation: translation.abilities,
		}),
		families: mergeMap(base.families, translation.families),
		looks: mergeMap(base.looks, translation.looks),
	};
	perDataset.set(locale, merged);
	return merged;
}
