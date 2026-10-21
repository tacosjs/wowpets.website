// Temporary navigation for testing data pages; the UI pass will replace it.
import { Link } from "@tanstack/react-router";
import LocaleSwitcher from "./LocaleSwitcher";

const looks = [
	{
		version: "retail",
		lookId: "mantid-tank-green",
		label: "Retail: Green Kunchong",
	},
	{
		version: "retail",
		lookId: "worg-black",
		label: "Retail: Black Saber Worg",
	},
	{ version: "classic", lookId: "wolf-black", label: "Classic: Black Wolf" },
	{ version: "forever", lookId: "fox", label: "Forever: (no data, 404)" },
	{ version: "retail", lookId: "missing", label: "Retail: unknown look (404)" },
];

export default function DevNav() {
	return (
		<nav>
			<ul>
				<li>
					<Link to="/">Home</Link>
				</li>
				{looks.map(({ version, lookId, label }) => (
					<li key={`${version}/${lookId}`}>
						<Link to="/$version/looks/$lookId" params={{ version, lookId }}>
							{label}
						</Link>
					</li>
				))}
			</ul>
			<LocaleSwitcher />
		</nav>
	);
}
