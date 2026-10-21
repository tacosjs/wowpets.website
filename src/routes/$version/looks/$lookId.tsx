// Bare SSR smoke page for the data layer; the UI pass will replace it.
import { createFileRoute } from "@tanstack/react-router";
import { getLook, type LookPage } from "#/data/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/$version/looks/$lookId")({
	loader: ({ params }) =>
		getLook({
			data: { version: params.version, id: params.lookId, locale: getLocale() },
		}),
	head: ({ loaderData }) => ({
		meta: loaderData
			? [{ title: `${loaderData.look.name} · ${loaderData.version.name}` }]
			: [],
	}),
	component: LookRoute,
});

type Npc = LookPage["npcs"][number];

const classificationLabel: Partial<
	Record<Npc["classification"], () => string>
> = {
	elite: m.classification_elite,
	rare: m.classification_rare,
	"rare-elite": m.classification_rare_elite,
	boss: m.classification_boss,
};

const zoneKindLabel: Record<string, (() => string) | undefined> = {
	dungeon: m.zone_kind_dungeon,
	raid: m.zone_kind_raid,
	scenario: m.zone_kind_scenario,
	battleground: m.zone_kind_battleground,
	warfront: m.zone_kind_warfront,
	delve: m.zone_kind_delve,
};

const conditionLabel = {
	quest: m.condition_quest,
	invasion: m.condition_invasion,
	summoned: m.condition_summoned,
	phase: m.condition_phase,
};

function wowheadUrl(page: LookPage, npcId: number) {
	const base = page.version.wowheadBase;
	if (!base) return undefined;
	const locale = getLocale();
	return `${base}${locale === "en" ? "" : `/${locale}`}/npc=${npcId}`;
}

function LookRoute() {
	const page = Route.useLoaderData();
	const tameable = page.npcs.filter((npc) => npc.tameable);
	const untameable = page.npcs.filter((npc) => !npc.tameable);
	const exotic = "exotic" in page.family && page.family.exotic;

	return (
		<main className="p-8 space-y-4">
			<p>
				{page.version.name} · {page.family.name} · {page.modelGroup.name}
			</p>
			<h1 className="text-3xl font-bold">{page.look.name}</h1>
			{exotic && <p>{m.family_exotic()}</p>}
			{page.look.note && <p>{page.look.note}</p>}
			{page.look.status === "unused" && <p>{m.look_unused()}</p>}
			<NpcList title={m.look_tameable()} npcs={tameable} page={page} />
			<NpcList title={m.look_untameable()} npcs={untameable} page={page} />
			<p className="text-sm">{m.level_scaling()}</p>
		</main>
	);
}

function NpcList({
	title,
	npcs,
	page,
}: {
	title: string;
	npcs: Npc[];
	page: LookPage;
}) {
	if (npcs.length === 0) return null;
	return (
		<section>
			<h2 className="text-xl font-semibold">{title}</h2>
			<ul className="list-disc pl-6">
				{npcs.map((npc) => (
					<li key={npc.id} data-npc={npc.id}>
						<a href={wowheadUrl(page, npc.id)}>{npc.name}</a>
						{npc.title && ` <${npc.title}>`}
						{npc.level &&
							` · ${m.npc_level({ min: npc.level.min, max: npc.level.max })}`}
						{classificationLabel[npc.classification] &&
							` · ${classificationLabel[npc.classification]?.()}`}
						{npc.locations.map((location) => (
							<span key={`${location.zone.id}-${location.area?.id ?? ""}`}>
								{" · "}
								{location.area ? `${location.area.name}, ` : ""}
								{location.zone.name}
								{zoneKindLabel[location.zone.kind] &&
									` (${zoneKindLabel[location.zone.kind]?.()})`}
							</span>
						))}
						{npc.retired && <div>{m.npc_retired()}</div>}
						{npc.keepsName && <div>{m.npc_keeps_name()}</div>}
						{npc.conditions?.map((condition) => (
							<div key={condition.kind}>{conditionLabel[condition.kind]()}</div>
						))}
						{"attackSpeed" in npc && npc.attackSpeed && (
							<div>
								{m.npc_attack_speed({ speed: npc.attackSpeed.toFixed(1) })}
							</div>
						)}
						{"abilities" in npc && npc.abilities && (
							<div>
								{m.npc_teaches()}:{" "}
								{npc.abilities.map((a) => `${a.ability} ${a.rank}`).join(", ")}
							</div>
						)}
						{npc.note && <div>{npc.note}</div>}
					</li>
				))}
			</ul>
		</section>
	);
}
