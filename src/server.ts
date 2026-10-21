// Runs every request inside Paraglide's middleware so getLocale() on the server
// reflects the URL (e.g. /fr/...). The router un-prefixes the URL itself.
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server";

export default createServerEntry({
	fetch(request) {
		return paraglideMiddleware(request, () => handler.fetch(request));
	},
});
