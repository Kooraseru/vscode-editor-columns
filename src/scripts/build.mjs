import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

await rm("../.generated", { recursive: true, force: true });
await mkdir("../.generated/main/src", { recursive: true });
await mkdir("../.generated/main/assets", { recursive: true });
await mkdir("../.generated/main/docs/ja-JP", { recursive: true });
await mkdir("../.generated/release", { recursive: true });
await Promise.all([
  copyFile("extension.js", "../.generated/main/src/extension.js"),
  copyFile("workbench-bridge.js", "../.generated/main/src/workbench-bridge.js"),
  copyFile("provider-host.js", "../.generated/main/src/provider-host.js"),
  copyFile("uninstall.js", "../.generated/main/src/uninstall.js"),
  copyFile("api.d.ts", "../.generated/main/src/api.d.ts"),
  copyFile("../assets/goofyaah.png", "../.generated/main/assets/goofyaah.png"),
  copyFile("package.json", "../.generated/main/package.json"),
  copyFile("package-lock.json", "../.generated/main/package-lock.json"),
  copyFile(".vscodeignore", "../.generated/main/.vscodeignore"),
  copyFile("../LICENSE", "../.generated/main/LICENSE"),
  copyFile("../CITATION.cff", "../.generated/main/CITATION.cff"),
  copyFile("../repo/templates/CONTRIBUTING.md", "../.generated/main/CONTRIBUTING.md"),
  copyFile("../repo/templates/CODE_OF_CONDUCT.md", "../.generated/main/CODE_OF_CONDUCT.md"),
  copyFile("../repo/templates/SECURITY.md", "../.generated/main/SECURITY.md"),
  copyFile("../repo/templates/AUTOMATION.md", "../.generated/main/AUTOMATION.md"),
  cp("../.github", "../.generated/main/.github", { recursive: true }),
  cp("../releases/records", "../.generated/main/releases", { recursive: true })
]);

const localeSource = await readFile("../i18n/locales.toml", "utf8");
const locales = [...localeSource.matchAll(/\{\s*key\s*=\s*"([^"]+)",\s*language\s*=\s*"([^"]+)"\s*\}/g)]
  .map(match => ({ key: match[1], language: match[2] }));
if (!locales.length) throw new Error("i18n/locales.toml contains no locales.");

const catalogSource = await readFile("../i18n/repository.toml", "utf8");
const catalog = new Map();
let section;
for (const line of catalogSource.split(/\r?\n/)) {
  const heading = line.match(/^\[([\w.-]+)\.values\]$/);
  if (heading) { section = heading[1]; catalog.set(section, new Map()); continue; }
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  const value = line.match(/^([\w-]+)\s*=\s*"(.*)"$/);
  if (!section || !value) throw new Error(`Invalid repository localization line: ${line}`);
  catalog.get(section).set(value[1], value[2].replaceAll("\\n", "\n"));
}

const template = await readFile("../repo/templates/README.md", "utf8");
function render(locale, links) {
  let output = template.replace(/{{\s*l10n:repository\.([\w.-]+)\s*}}/g, (_, key) => {
    const values = catalog.get(key);
    const value = values?.get(locale) ?? values?.get("en-US");
    if (value === undefined) throw new Error(`Unknown localization key: repository.${key}`);
    return value;
  });
  output = output.replace(/{{\s*link:([\w.-]+)\s*}}/g, (_, key) => {
    if (!links[key]) throw new Error(`Unknown document link: ${key}`);
    return links[key];
  });
  return output.replace(/{{\s*locales:repository\s*}}/g, () => {
    const cells = locales.filter(item => item.key !== locale).map(item =>
      `<td><a href="${links.locales[item.key]}">${item.language}</a></td>`);
    return `<table><tr>${cells.join("")}</tr></table>`;
  });
}

const repositoryRoot = "https://github.com/Kooraseru/vscode-editor-columns";
const repositoryRawRoot = "https://raw.githubusercontent.com/Kooraseru/vscode-editor-columns/HEAD";
await Promise.all([
  writeFile("../.generated/main/README.md", render("en-US", {
    icon: `${repositoryRawRoot}/assets/goofyaah.png`,
    license: "LICENSE",
    locales: { "ja-JP": `${repositoryRoot}/blob/HEAD/docs/ja-JP/README.md` }
  }), "utf8"),
  writeFile("../.generated/main/docs/ja-JP/README.md", render("ja-JP", {
    icon: `${repositoryRawRoot}/assets/goofyaah.png`,
    license: "../../LICENSE",
    locales: { "en-US": `${repositoryRoot}/blob/HEAD/README.md` }
  }), "utf8")
]);

const releaseFiles = (await readdir("../releases/records"))
  .filter(file => file.endsWith(".md"))
  .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
const changelogSections = await Promise.all(releaseFiles.map(file => readFile(`../releases/records/${file}`, "utf8")));
await writeFile("../.generated/main/CHANGELOG.md", `# Changelog\n\n${changelogSections.join("\n\n")}\n`, "utf8");
console.log("Built the generated main-branch projection in .generated/main/.");
