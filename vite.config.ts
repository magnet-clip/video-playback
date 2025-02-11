import { defineConfig } from "vite";
import suidPlugin from "@suid/vite-plugin";
import solidPlugin from "vite-plugin-solid";
import devtools from "solid-devtools/vite";

export default defineConfig({
    plugins: [
        devtools({
            /* features options - all disabled by default */
            autoname: true, // e.g. enable autoname
        }),
        suidPlugin(),
        solidPlugin(),
    ],
    server: {
        port: 3000,
    },
    build: {
        target: "esnext",
    },
});
