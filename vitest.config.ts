import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so tests don't boot the Start/Netlify plugins.
export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: { include: ["src/**/*.test.ts"] },
});
