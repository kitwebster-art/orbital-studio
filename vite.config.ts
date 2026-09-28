import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "./index.html",
        levitation: "./levitation.html",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4178,
  },
  preview: {
    host: "127.0.0.1",
    port: 4179,
  },
});
