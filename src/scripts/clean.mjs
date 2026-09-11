import { rm } from "node:fs/promises";

await rm("../.generated", { recursive: true, force: true });
console.log("Removed all generated extension output.");
