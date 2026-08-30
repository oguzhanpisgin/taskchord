import process from "node:process";
import { executeCli } from "./cli.js";

const result = await executeCli(process.argv.slice(2));

if (result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}

if (result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
