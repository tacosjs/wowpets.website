// Reads facts from wow-petopia.com pages. Editorial content (notes, images) is
// never extracted, only structure, ids, flags and short labels (see ADR 0006).
import * as cheerio from "cheerio";
import { fetchCached } from "./fetch.ts";

const base = "https://www.wow-petopia.com";

export const slugify = (name: string) =>
	name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const normalizeLookId = (petopiaId: string) =>
	petopiaId
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export type LookSection = "regular" | "untameable" | "unused" | "otherfamily";

export type FamilyPage = {
	id: string;
	name: string;
	icon?: string;
	diet: string[];
	spec: string;
	exotic: boolean;
	requiredSkill?: string;
	abilities: { spellId: number; name: string; section: string }[];
	modelGroups: {
		id: string;
		name: string;
		looks: {
			petopiaId: string;
			section: LookSection;
			name: string;
			variant: string;
		}[];
	}[];
};

export type LookPage = {
	npcs: {
		id: number;
		name: string;
		title?: string;
		tameable: boolean;
		levelTokens: string[];
		zoneLines: string[];
		keepsName: boolean;
	}[];
};

/** Text of each <br/>-separated line in a cell. */
const lines = (html: string | null) =>
	(html ?? "")
		.split(/<br\s*\/?>/i)
		.map((part) => cheerio.load(part).text().trim())
		.filter(Boolean);

export const fetchFamilyIds = async () => {
	const $ = cheerio.load(
		await fetchCached({
			url: `${base}/index.php`,
			cacheFile: "petopia/index.html",
		}),
	);
	const ids = new Set<string>();
	$("a[href*='family.php?id=']").each((_, link) => {
		const id = /family\.php\?id=([a-z0-9_-]+)/.exec(
			$(link).attr("href") ?? "",
		)?.[1];
		if (id) ids.add(id);
	});
	return [...ids].sort();
};

export const fetchFamily = async (id: string): Promise<FamilyPage> => {
	const $ = cheerio.load(
		await fetchCached({
			url: `${base}/family.php?id=${id}`,
			cacheFile: `petopia/family/${id}.html`,
		}),
	);
	const heading = $("h1.familyheadingname");
	const iconSrc = heading.find("img").attr("src");

	const abilities: FamilyPage["abilities"] = [];
	$(".familydetailsblock.abilities .familydetailsabilities").each(
		(_, block) => {
			const section = ($(block).attr("class") ?? "")
				.split(/\s+/)
				.find((name) => name !== "familydetailsabilities");
			$(block)
				.find(".familyabilityitem a")
				.each((_, link) => {
					const spellId = Number(
						/spell=(\d+)/.exec($(link).attr("href") ?? "")?.[1],
					);
					if (spellId) {
						abilities.push({
							spellId,
							name: $(link).text().trim(),
							section: section ?? "",
						});
					}
				});
		},
	);

	const spec = $(".familydetailsabilities.spec strong").clone();
	spec.find("em").remove();

	let requiredSkill: string | undefined;
	$(".familydetailsheading").each((_, el) => {
		if ($(el).text().trim() !== "Taming Requirement") return;
		const text = $(el)
			.closest(".familydetailsblock")
			.find(".familydetailssection")
			.text()
			.trim();
		const skill = /^(.+?)\s+Taming\b/.exec(text)?.[1];
		if (!skill)
			throw new Error(
				`${id}: can't read taming requirement "${text.slice(0, 60)}"`,
			);
		requiredSkill = slugify(skill);
	});

	const modelGroups: FamilyPage["modelGroups"] = [];
	$("h3.family_model_subheading").each((_, h3) => {
		const groupId = /^model=(.+)$/.exec($(h3).attr("id") ?? "")?.[1];
		if (!groupId) return;
		const title = $(h3).clone();
		title.children().remove();
		const looks: FamilyPage["modelGroups"][number]["looks"] = [];
		$(h3)
			.nextUntil("h3.family_model_subheading, h2")
			.find("a.look_thumb_link")
			.each((_, link) => {
				const petopiaId = /look\.php\?id=([^&#'"]+)/.exec(
					$(link).attr("href") ?? "",
				)?.[1];
				if (!petopiaId) return;
				const formId = $(link).closest("form.unusedselector").attr("id") ?? "";
				const suffix = /-(unused|untameable|otherfamily)$/.exec(formId)?.[1];
				looks.push({
					petopiaId,
					section: (suffix as LookSection | undefined) ?? "regular",
					name: $(link).find("img").attr("alt")?.trim() ?? petopiaId,
					variant: $(link).find(".look_thumb_name").text().trim() || petopiaId,
				});
			});
		modelGroups.push({ id: groupId, name: title.text().trim(), looks });
	});

	return {
		id,
		name: heading.text().trim(),
		icon: iconSrc ? /([^/]+)\.\w+$/.exec(iconSrc)?.[1] : undefined,
		diet: $(".familydetailsabilities.diet .familydetailsdata")
			.text()
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
		spec: spec.text().trim(),
		exotic: $(".familyexoticicon").length > 0,
		requiredSkill,
		abilities,
		modelGroups,
	};
};

export const fetchLook = async (petopiaId: string): Promise<LookPage> => {
	const $ = cheerio.load(
		await fetchCached({
			url: `${base}/look.php?id=${encodeURIComponent(petopiaId)}`,
			cacheFile: `petopia/look/${petopiaId}.html`,
		}),
	);
	const npcs: LookPage["npcs"] = [];
	for (const [table, tameable] of [
		["#tameabletable", true],
		["#untameabletable", false],
	] as const) {
		$(table)
			.find("tr.petstats")
			.each((_, row) => {
				const link = $(row).find(".pettablename a");
				const id = Number(
					/npc\.php\?id=(\d+)/.exec(link.attr("href") ?? "")?.[1],
				);
				if (!id) return;
				const title = /^<(.+)>$/.exec(
					$(row).find(".pettabletitle").text().trim(),
				)?.[1];
				const note = $(row).next("tr.petnotes").text();
				// Exotic rows show the hunter's minimum taming level before the real one.
				const level = $(row).find("td.level").clone();
				level.find(".exoticlevelmin").remove();
				npcs.push({
					id,
					name: link.text().trim(),
					title,
					tameable,
					levelTokens: lines(level.html())
						.flatMap((line) => line.split(","))
						.map((token) =>
							token
								.replace(/^\(NPC Level:\s*/i, "")
								.replace(/\)$/, "")
								.trim(),
						)
						.filter(Boolean),
					zoneLines: lines($(row).find("td.zone").html()),
					keepsName: /retains its original name/i.test(note),
				});
			});
	}
	return { npcs };
};
