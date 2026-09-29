import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Image checks do not depend on Storybook's browser project or wallet services.
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/__tests__/image-optimization.test.tsx",
      "src/components/shared/__tests__/LazyImage.test.tsx",
      "src/components/ui/__tests__/Avatar.test.tsx",
      "src/helpers/__tests__/avatarImage.test.ts",
    ],
  },
});
