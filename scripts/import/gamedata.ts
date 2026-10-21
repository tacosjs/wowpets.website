// Official game names (en + fr) from wago.tools DB2 CSV exports.
import { fetchCached } from "./fetch.ts";

type Row = Record<string, string>;

/** RFC 4180-style parser: quoted fields, "" escapes, commas/newlines inside quotes. */
export const parseCsv = (text: string): Row[] => {
	const records: string[][] = [];
	let field = "";
	let record: string[] = [];
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			record.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++;
			record.push(field);
			records.push(record);
			record = [];
			field = "";
		} else {
			field += char;
		}
	}
	if (field || record.length) {
		record.push(field);
		records.push(record);
	}
	const [header, ...rows] = records;
	return rows
		.filter((row) => row.length === header.length)
		.map((row) =>
			Object.fromEntries(header.map((key, index) => [key, row[index]])),
		);
};

const loadTable = async ({
	table,
	locale,
}: {
	table: string;
	locale: "enUS" | "frFR";
}) =>
	parseCsv(
		await fetchCached({
			url: `https://wago.tools/db2/${table}/csv?locale=${locale}`,
			cacheFile: `wago/${table}-${locale}.csv`,
		}),
	);

export type Area = {
	id: number;
	parentId: number;
	continentId: number;
	en: string;
	fr?: string;
};

export type GameData = {
	/** English area name (lowercased) → candidate areas. */
	areasByName: Map<string, Area[]>;
	spells: Map<number, { en?: string; fr?: string }>;
	families: Map<number, { en?: string; fr?: string }>;
	/** Partial table: many NPCs are missing. */
	creatures: Map<number, { family: number; frName?: string; frTitle?: string }>;
};

export const loadGameData = async (): Promise<GameData> => {
	const [
		areasEn,
		areasFr,
		spellsEn,
		spellsFr,
		familiesEn,
		familiesFr,
		creaturesFr,
	] = await Promise.all([
		loadTable({ table: "AreaTable", locale: "enUS" }),
		loadTable({ table: "AreaTable", locale: "frFR" }),
		loadTable({ table: "SpellName", locale: "enUS" }),
		loadTable({ table: "SpellName", locale: "frFR" }),
		loadTable({ table: "CreatureFamily", locale: "enUS" }),
		loadTable({ table: "CreatureFamily", locale: "frFR" }),
		loadTable({ table: "Creature", locale: "frFR" }),
	]);

	const frAreaNames = new Map(
		areasFr.map((row) => [row.ID, row.AreaName_lang]),
	);
	const areasByName = new Map<string, Area[]>();
	for (const row of areasEn) {
		if (!row.AreaName_lang) continue;
		const key = row.AreaName_lang.toLowerCase();
		const list = areasByName.get(key) ?? [];
		list.push({
			id: Number(row.ID),
			parentId: Number(row.ParentAreaID),
			continentId: Number(row.ContinentID),
			en: row.AreaName_lang,
			fr: frAreaNames.get(row.ID) || undefined,
		});
		areasByName.set(key, list);
	}

	const byId = (enRows: Row[], frRows: Row[]) => {
		const map = new Map<number, { en?: string; fr?: string }>();
		for (const row of enRows)
			map.set(Number(row.ID), { en: row.Name_lang || undefined });
		for (const row of frRows) {
			const entry = map.get(Number(row.ID)) ?? {};
			entry.fr = row.Name_lang || undefined;
			map.set(Number(row.ID), entry);
		}
		return map;
	};

	const creatures = new Map<
		number,
		{ family: number; frName?: string; frTitle?: string }
	>();
	for (const row of creaturesFr) {
		creatures.set(Number(row.ID), {
			family: Number(row.CreatureFamily),
			frName: row.Name_lang || undefined,
			frTitle: row.Title_lang || undefined,
		});
	}

	return {
		areasByName,
		spells: byId(spellsEn, spellsFr),
		families: byId(familiesEn, familiesFr),
		creatures,
	};
};
