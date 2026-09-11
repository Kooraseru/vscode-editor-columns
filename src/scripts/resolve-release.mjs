import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export async function resolveRelease(root = ".") {
  const publication = JSON.parse(await readFile(`${root}/releases/publication.json`, "utf8"));
  const extension = JSON.parse(await readFile(`${root}/src/package.json`, "utf8"));
  if (!/^\d{4}\.\d{2}\.[1-9]\d*-(regular|hotfix|security)$/.test(publication.record)) {
    throw new Error(`Invalid release record ID: ${publication.record}`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(publication.version)) {
    throw new Error(`Invalid extension version: ${publication.version}`);
  }
  if (publication.version !== extension.version) {
    throw new Error(`Publication version ${publication.version} does not match extension version ${extension.version}.`);
  }
  if (publication.tag !== `v${publication.version}`) {
    throw new Error(`Publication tag must be v${publication.version}.`);
  }
  await access(`${root}/releases/records/${publication.record}.md`);
  return Object.freeze({
    enabled: publication.enabled === true,
    record: publication.record,
    version: publication.version,
    tag: publication.tag
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const release = await resolveRelease();
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT,
      `enabled=${release.enabled}\nrecord=${release.record}\nversion=${release.version}\ntag=${release.tag}\n`);
  } else {
    console.log(JSON.stringify(release));
  }
}
