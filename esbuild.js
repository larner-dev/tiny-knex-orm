#!/usr/bin/env node

/*
 * THIS IS A GENERATED FILE
 * IF YOU MAKE CHANGES TO THIS FILE YOU MAY RUN INTO CONFLICTS
 * WHEN UPGRADING TO A NEWER VERSION OF THE GENERATED CODE.
 */

import * as esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));

const format = (process.argv[2] || "esm").toLowerCase();
const watch = process.argv[3] === "--watch";

const entryPoints = ["./src/index.ts"];

const options = {
  entryPoints,
  bundle: true,
  outdir: `build/${format}`,
  target: "node16",
  format,
  packages: "external",
  watch,
};

if (format === "cjs") {
  options.outExtension = { ".js": ".cjs" };
}

await esbuild.build(options);
