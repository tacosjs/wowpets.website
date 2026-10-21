import { describe, expect, it } from "vitest";
import { buildDataset, type Dataset, gameVersions } from "./dataset";
import { checkIntegrity, translationCoverage } from "./integrity";
import { formatIssues, loadAll } from "./load.server";
import { versionDefinitions } from "./versions";
import { familyView, lookView } from "./views";

describe("data/", () => {
	const { datasets, issues } = loadAll();

	it("parses every version with no errors", () => {
		const errors = issues.filter((issue) => issue.level === "error");
		expect(formatIssues(errors)).toBe("");
	});

	it("reports translation coverage", () => {
		for (const version of gameVersions) {
			for (const c of translationCoverage({
				dataset: datasets[version] as Dataset,
			})) {
				console.info(
					`${c.version}/${c.locale}: ${c.translated}/${c.total} strings translated`,
				);
			}
		}
	});

	it("serves a fully translated look in French", () => {
		const view = lookView({
			dataset: datasets.retail,
			lookId: "mantidtank-green",
			locale: "fr",
		});
		expect(view?.look.name).toBe("Kunchong vert");
		expect(view?.look.status).toBe("tameable");
		expect(view?.npcs.map((npc) => npc.name)).toEqual([
			"Kunchong ik’thik énorme",
			"Raigonn",
			"Kunchong zara'thik",
			"Chitigoth",
		]);
		expect(view?.npcs[1].locations[0].zone).toMatchObject({
			name: "Porte du Soleil couchant",
			kind: "dungeon",
		});
	});

	it("falls back to English key by key", () => {
		const view = lookView({
			dataset: datasets.retail,
			lookId: "worgblack",
			locale: "fr",
		});
		const npc = (id: number) => view?.npcs.find((n) => n.id === id);
		const rockfang = npc(25774);
		const goremaw = npc(27578);
		expect(rockfang).toMatchObject({
			name: "Rochecroc",
			title: "Mère de la tanière",
		});
		// fr has Rockfang's name but not his note, and nothing for Goremaw.
		expect(rockfang?.note).toMatch(/Plains of Nasam/);
		expect(goremaw?.name).toBe("Goremaw");
		expect(rockfang?.locations[0].zone.name).toBe("Toundra Boréenne");
	});

	it("keeps version-specific facts in views", () => {
		const view = lookView({
			dataset: datasets.classic,
			lookId: "wolf-black",
			locale: "en",
		});
		expect(view?.npcs[0]).toMatchObject({
			name: "Snarler",
			attackSpeed: 2,
			abilities: [
				{ ability: "bite", rank: 6 },
				{ ability: "furious-howl", rank: 3 },
			],
		});
	});

	it("lists a family's abilities including retail common ones", () => {
		const definition = versionDefinitions.retail;
		const view = familyView({
			dataset: datasets.retail,
			familyId: "wolf",
			locale: "en",
			abilityIds: (family) =>
				definition.familyAbilityIds({
					family,
					abilities: datasets.retail.abilities,
				}),
		});
		const abilityIds = view?.abilities.map((a) => a.id) ?? [];
		expect(abilityIds).toEqual(
			expect.arrayContaining(["dash", "growl", "bite", "furious-bite"]),
		);
		// Common abilities come first.
		expect(abilityIds.slice(0, 2)).toEqual(["dash", "growl"]);
		const worgs = view?.modelGroups.find((g) => g.id === "saberworgs");
		const black = worgs?.looks.find((l) => l.id === "worgblack");
		expect(black?.status).toBe("tameable");
		expect(black?.tameableCount).toBeGreaterThan(0);
	});

	it("gives every family at least one look", () => {
		for (const version of gameVersions) {
			const dataset = datasets[version] as Dataset;
			const empty = [...dataset.families.keys()].filter(
				(id) => ![...dataset.looks.values()].some((l) => l.family === id),
			);
			expect(empty, version).toEqual([]);
		}
	});
});

describe("integrity", () => {
	const definition = versionDefinitions.retail;

	/** Smallest valid retail tree; each test breaks one thing. */
	function fixture(): Record<string, unknown> {
		return {
			"version.json": { id: "retail" },
			"zones.json": [{ id: "elwynn-forest", kind: "zone" }],
			"abilities.json": [{ id: "bite", spellId: 17253, kind: "basic" }],
			"families/wolf.json": {
				id: "wolf",
				spec: "ferocity",
				exotic: false,
				diet: ["meat"],
				abilities: { basic: "bite", family: [] },
				modelGroups: [{ id: "wolves" }],
			},
			"looks/wolf-grey.json": {
				id: "wolf-grey",
				family: "wolf",
				modelGroup: "wolves",
				npcs: [
					{
						id: 299,
						tameable: true,
						classification: "normal",
						locations: [{ zone: "elwynn-forest" }],
					},
				],
			},
			"locales/en/version.json": { name: "Retail" },
			"locales/en/zones.json": { "elwynn-forest": { name: "Elwynn Forest" } },
			"locales/en/abilities.json": { bite: { name: "Bite" } },
			"locales/en/families/wolf.json": {
				name: "Wolves",
				modelGroups: { wolves: { name: "Wolves" } },
			},
			"locales/en/looks/wolf-grey.json": {
				name: "Grey Wolf",
				variant: "Grey",
				npcs: { "299": { name: "Diseased Young Wolf" } },
			},
		};
	}

	function errorsFor(files: Record<string, unknown>) {
		const { dataset, issues } = buildDataset({ definition, files });
		return [...issues, ...checkIntegrity({ definition, dataset })].filter(
			(issue) => issue.level === "error",
		);
	}

	it("accepts the fixture", () => {
		expect(errorsFor(fixture())).toEqual([]);
	});

	it("rejects a dangling model group", () => {
		const files = fixture();
		(files["looks/wolf-grey.json"] as { modelGroup: string }).modelGroup =
			"worgs";
		expect(errorsFor(files)).toEqual([
			expect.objectContaining({
				file: "retail/looks/wolf-grey.json",
				path: "modelGroup",
				message: 'Family "wolf" has no model group "worgs"',
			}),
		]);
	});

	it("rejects an NPC defined in two looks", () => {
		const files = fixture();
		files["looks/wolf-dark.json"] = {
			...(files["looks/wolf-grey.json"] as object),
			id: "wolf-dark",
		};
		files["locales/en/looks/wolf-dark.json"] =
			files["locales/en/looks/wolf-grey.json"];
		expect(errorsFor(files)).toEqual([
			expect.objectContaining({
				file: "retail/looks/wolf-dark.json",
				path: "npcs.0.id",
				message: expect.stringContaining(
					"already defined in looks/wolf-grey.json",
				),
			}),
		]);
	});

	it("rejects a translation for an unknown NPC", () => {
		const files = fixture();
		files["locales/fr/looks/wolf-grey.json"] = {
			npcs: { "1234": { name: "Loup" } },
		};
		expect(errorsFor(files)).toEqual([
			expect.objectContaining({
				file: "retail/locales/fr/looks/wolf-grey.json",
				path: "npcs.1234",
				message: 'Unknown NPC "1234"',
			}),
		]);
	});

	it("rejects a missing English name", () => {
		const files = fixture();
		files["locales/en/looks/wolf-grey.json"] = {
			name: "Grey Wolf",
			variant: "Grey",
			npcs: {},
		};
		expect(errorsFor(files)).toEqual([
			expect.objectContaining({
				file: "retail/locales/en/looks/wolf-grey.json",
				path: "npcs.299",
				message: 'Missing text for NPC "299"',
			}),
		]);
	});

	it("rejects unknown keys and bad values with the file and path", () => {
		const files = fixture();
		files["locales/en/families/wolf.json"] = {
			nmae: "Wolves",
			modelGroups: { wolves: { name: "Wolves" } },
		};
		const errors = errorsFor(files);
		expect(errors).toContainEqual(
			expect.objectContaining({
				file: "retail/locales/en/families/wolf.json",
				path: "name",
			}),
		);
		expect(errors.some((e) => e.message.includes("nmae"))).toBe(true);
	});
});
