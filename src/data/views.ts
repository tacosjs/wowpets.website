// Turns facts + one locale's text into plain, serializable view objects. These
// are what server functions return, so the client never receives other locales.
import type {
	AbilityBase,
	Dataset,
	FamilyBase,
	Locale,
	LookBase,
} from "./dataset";
import { textFor } from "./localize";
import type { BaseText } from "./schema/common";

type Npc<L extends LookBase> = L["npcs"][number];

export type ZoneView = {
	id: string;
	kind: string;
	name: string;
	wowId?: number;
};

export type NpcView<L extends LookBase = LookBase> = Omit<
	Npc<L>,
	"locations"
> & {
	name: string;
	title?: string;
	note?: string;
	/** Look file that defines the NPC (differs for alsoNpcs). */
	lookId: string;
	locations: {
		zone: ZoneView;
		area?: ZoneView;
		coords?: { x: number; y: number }[];
	}[];
};

export type LookStatus = "tameable" | "untameable" | "unused";

const npcIndexes = new WeakMap<Dataset, Map<number, string>>();

function npcHome(dataset: Dataset, npcId: number) {
	let index = npcIndexes.get(dataset);
	if (!index) {
		index = new Map();
		for (const look of dataset.looks.values()) {
			for (const npc of look.npcs) index.set(npc.id, look.id);
		}
		npcIndexes.set(dataset, index);
	}
	return index.get(npcId);
}

function versionView(dataset: Dataset, text: BaseText) {
	return {
		id: dataset.version,
		name: text.version.name,
		patch: dataset.meta.patch,
		wowheadBase: dataset.meta.wowheadBase,
	};
}

function zoneView(dataset: Dataset, text: BaseText, id: string): ZoneView {
	const zone = dataset.zones.get(id);
	return {
		id,
		kind: zone?.kind ?? "zone",
		name: text.zones[id]?.name ?? id,
		wowId: zone?.wowId,
	};
}

function toNpcView<L extends LookBase>(
	dataset: Dataset,
	text: BaseText,
	npc: Npc<L>,
	lookId: string,
): NpcView<L> {
	const npcText = text.looks.get(lookId)?.npcs[String(npc.id)];
	return {
		...npc,
		name: npcText?.name ?? String(npc.id),
		title: npcText?.title,
		note: npcText?.note,
		lookId,
		locations: npc.locations.map((location) => ({
			zone: zoneView(dataset, text, location.zone),
			area: location.area ? zoneView(dataset, text, location.area) : undefined,
			coords: location.coords,
		})),
	};
}

function lookNpcs<L extends LookBase>(dataset: Dataset, look: L) {
	const also = (look.alsoNpcs ?? []).flatMap((npcId) => {
		const home = npcHome(dataset, npcId);
		const npc = home
			? dataset.looks.get(home)?.npcs.find((n) => n.id === npcId)
			: undefined;
		return home && npc ? [{ npc: npc as Npc<L>, lookId: home }] : [];
	});
	return [...look.npcs.map((npc) => ({ npc, lookId: look.id })), ...also];
}

function statusOf(npcs: { npc: { tameable: boolean } }[]): LookStatus {
	if (npcs.some(({ npc }) => npc.tameable)) return "tameable";
	return npcs.length > 0 ? "untameable" : "unused";
}

function familySummary(text: BaseText, family: FamilyBase) {
	const familyText = text.families.get(family.id);
	return {
		...family,
		name: familyText?.name ?? family.id,
		note: familyText?.note,
	};
}

function abilityViews<A extends AbilityBase>(
	dataset: Dataset<FamilyBase, LookBase, A>,
	text: BaseText,
	ids: string[],
) {
	return ids.flatMap((id) => {
		const ability = dataset.abilities.get(id);
		return ability
			? [
					{
						...ability,
						name: text.abilities[id]?.name ?? id,
						description: text.abilities[id]?.description,
					},
				]
			: [];
	});
}

export function listFamiliesView<F extends FamilyBase>({
	dataset,
	locale,
}: {
	dataset: Dataset<F>;
	locale: Locale;
}) {
	const text = textFor({ dataset, locale });
	const families = [...dataset.families.values()]
		.map(
			(family) =>
				familySummary(text, family) as F & { name: string; note?: string },
		)
		.sort((a, b) => a.name.localeCompare(b.name, locale));
	return { version: versionView(dataset, text), families };
}

export function familyView<
	F extends FamilyBase,
	L extends LookBase,
	A extends AbilityBase,
>({
	dataset,
	familyId,
	locale,
	abilityIds,
}: {
	dataset: Dataset<F, L, A>;
	familyId: string;
	locale: Locale;
	/** From the version definition's familyAbilityIds. */
	abilityIds: (family: F) => string[];
}) {
	const family = dataset.families.get(familyId);
	if (!family) return undefined;
	const text = textFor({ dataset, locale });
	const familyText = text.families.get(familyId);
	const looks = [...dataset.looks.values()].filter(
		(look) => look.family === familyId,
	);
	return {
		version: versionView(dataset, text),
		family: familySummary(text, family) as F & { name: string; note?: string },
		abilities: abilityViews(dataset, text, abilityIds(family)),
		modelGroups: family.modelGroups.map((group) => ({
			id: group.id,
			name: familyText?.modelGroups[group.id]?.name ?? group.id,
			note: familyText?.modelGroups[group.id]?.note,
			looks: looks
				.filter((look) => look.modelGroup === group.id)
				.map((look) => {
					const lookText = text.looks.get(look.id);
					const npcs = lookNpcs(dataset, look);
					return {
						id: look.id,
						name: lookText?.name ?? look.id,
						variant: lookText?.variant ?? look.id,
						status: statusOf(npcs),
						tameableCount: npcs.filter(({ npc }) => npc.tameable).length,
					};
				}),
		})),
	};
}

export function lookView<F extends FamilyBase, L extends LookBase>({
	dataset,
	lookId,
	locale,
}: {
	dataset: Dataset<F, L>;
	lookId: string;
	locale: Locale;
}) {
	const look = dataset.looks.get(lookId);
	const family = look && dataset.families.get(look.family);
	if (!look || !family) return undefined;
	const text = textFor({ dataset, locale });
	const lookText = text.looks.get(lookId);
	const groupText = text.families.get(family.id)?.modelGroups[look.modelGroup];
	const npcs = lookNpcs(dataset, look);
	const { npcs: _npcs, alsoNpcs: _alsoNpcs, ...lookFacts } = look;
	return {
		version: versionView(dataset, text),
		family: familySummary(text, family) as F & { name: string; note?: string },
		modelGroup: {
			id: look.modelGroup,
			name: groupText?.name ?? look.modelGroup,
			note: groupText?.note,
		},
		look: {
			...lookFacts,
			name: lookText?.name ?? look.id,
			variant: lookText?.variant ?? look.id,
			note: lookText?.note,
			status: statusOf(npcs),
		},
		npcs: npcs.map(({ npc, lookId: home }) =>
			toNpcView<L>(dataset, text, npc, home),
		),
	};
}

export function npcView<F extends FamilyBase, L extends LookBase>({
	dataset,
	npcId,
	locale,
}: {
	dataset: Dataset<F, L>;
	npcId: number;
	locale: Locale;
}) {
	const home = npcHome(dataset, npcId);
	const look = home ? dataset.looks.get(home) : undefined;
	const npc = look?.npcs.find((n) => n.id === npcId);
	const family = look && dataset.families.get(look.family);
	if (!look || !npc || !family) return undefined;
	const text = textFor({ dataset, locale });
	const lookText = text.looks.get(look.id);
	return {
		version: versionView(dataset, text),
		family: {
			id: family.id,
			name: text.families.get(family.id)?.name ?? family.id,
		},
		look: { id: look.id, name: lookText?.name ?? look.id },
		npc: toNpcView<L>(dataset, text, npc, look.id),
	};
}
