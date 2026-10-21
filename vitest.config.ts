import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so tests don't boot the Start/Netlify plugins.
export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["src/**/*.test.ts"],
		// The persistent module cache keys on file content, so load.server.ts's
		// import.meta.glob would keep a stale file list after data/ changes.
		fsModuleCache: false,
	},
});
