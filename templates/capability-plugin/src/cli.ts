#!/usr/bin/env node
import { hello } from "./index.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(`Usage: __CAPABILITY_ID__ <name>`);
  process.exit(0);
}

console.log(hello(args[0]));
