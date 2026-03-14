import { plugin } from "bun";

plugin({
  name: "vite-env-mock",
  setup(build) {
    build.onLoad({ filter: /utils\.ts$/ }, async (args) => {
      let code = await Bun.file(args.path).text();
      // Replace import.meta.env.BASE_URL with a mock string
      code = code.replace(/import\.meta\.env\.BASE_URL/g, "'/'");
      return {
        contents: code,
        loader: "tsx",
      };
    });
  },
});
