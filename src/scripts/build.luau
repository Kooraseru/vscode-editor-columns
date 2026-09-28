local fs = require("@lune/fs")
local serde = require("@lune/serde")
local tooling = require("./tooling")

for _, path in { "../.heap/preview/repo/main", "../.heap/preview/release" } do
	if fs.isDir(path) then fs.removeDir(path) end
end
for _, directory in { "../.heap/preview/repo/main/src", "../.heap/preview/repo/main/assets", "../.heap/preview/repo/main/docs/ja-JP", "../.heap/preview/release" } do
	fs.writeDir(directory)
end

local copies = {
	{ "../.heap/cache/compiled/main/extension.js", "../.heap/preview/repo/main/src/extension.js" },
	{ "../.heap/cache/compiled/main/extension.js.map", "../.heap/preview/repo/main/src/extension.js.map" },
	{ "../.heap/cache/compiled/main/workbench-bridge.js", "../.heap/preview/repo/main/src/workbench-bridge.js" },
	{ "../.heap/cache/compiled/main/workbench-bridge.js.map", "../.heap/preview/repo/main/src/workbench-bridge.js.map" },
	{ "../.heap/cache/compiled/main/columns.css", "../.heap/preview/repo/main/src/columns.css" },
	{ "../.heap/cache/compiled/main/provider-host.js", "../.heap/preview/repo/main/src/provider-host.js" },
	{ "../.heap/cache/compiled/main/provider-host.js.map", "../.heap/preview/repo/main/src/provider-host.js.map" },
	{ "../.heap/cache/compiled/main/provider-registry.js", "../.heap/preview/repo/main/src/provider-registry.js" },
	{ "../.heap/cache/compiled/main/provider-registry.js.map", "../.heap/preview/repo/main/src/provider-registry.js.map" },
	{ "../.heap/cache/compiled/main/state-coordinator.js", "../.heap/preview/repo/main/src/state-coordinator.js" },
	{ "../.heap/cache/compiled/main/state-coordinator.js.map", "../.heap/preview/repo/main/src/state-coordinator.js.map" },
	{ "../.heap/cache/compiled/main/bridge-protocol.js", "../.heap/preview/repo/main/src/bridge-protocol.js" },
	{ "../.heap/cache/compiled/main/bridge-protocol.js.map", "../.heap/preview/repo/main/src/bridge-protocol.js.map" },
	{ "../.heap/cache/compiled/main/bridge-transport.js", "../.heap/preview/repo/main/src/bridge-transport.js" },
	{ "../.heap/cache/compiled/main/bridge-transport.js.map", "../.heap/preview/repo/main/src/bridge-transport.js.map" },
	{ "../.heap/cache/compiled/main/workbench-compatibility.js", "../.heap/preview/repo/main/src/workbench-compatibility.js" },
	{ "../.heap/cache/compiled/main/workbench-compatibility.js.map", "../.heap/preview/repo/main/src/workbench-compatibility.js.map" },
	{ "../.heap/cache/compiled/main/workbench-installer.js", "../.heap/preview/repo/main/src/workbench-installer.js" },
	{ "../.heap/cache/compiled/main/workbench-installer.js.map", "../.heap/preview/repo/main/src/workbench-installer.js.map" },
	{ "../.heap/cache/compiled/main/workbench-admin.js", "../.heap/preview/repo/main/src/workbench-admin.js" },
	{ "../.heap/cache/compiled/main/workbench-admin.js.map", "../.heap/preview/repo/main/src/workbench-admin.js.map" },
	{ "../.heap/cache/compiled/main/uninstall.js", "../.heap/preview/repo/main/src/uninstall.js" },
	{ "../.heap/cache/compiled/main/uninstall.js.map", "../.heap/preview/repo/main/src/uninstall.js.map" },
	{ "api.d.ts", "../.heap/preview/repo/main/src/api.d.ts" },
	{ "../assets/goofyaah.png", "../.heap/preview/repo/main/assets/goofyaah.png" },
	{ "package.json", "../.heap/preview/repo/main/package.json" },
	{ "package-lock.json", "../.heap/preview/repo/main/package-lock.json" },
	{ ".vscodeignore", "../.heap/preview/repo/main/.vscodeignore" },
	{ "../LICENSE", "../.heap/preview/repo/main/LICENSE" },
	{ "../CITATION.cff", "../.heap/preview/repo/main/CITATION.cff" },
	{ "../repo/templates/CONTRIBUTING.md", "../.heap/preview/repo/main/CONTRIBUTING.md" },
	{ "../repo/templates/CODE_OF_CONDUCT.md", "../.heap/preview/repo/main/CODE_OF_CONDUCT.md" },
	{ "../repo/templates/SECURITY.md", "../.heap/preview/repo/main/SECURITY.md" },
	{ "../repo/templates/AUTOMATION.md", "../.heap/preview/repo/main/AUTOMATION.md" },
}
for _, pair in copies do fs.copy(pair[1], pair[2], true) end
fs.copy("../.github", "../.heap/preview/repo/main/.github", true)
fs.copy("../releases/records", "../.heap/preview/repo/main/releases", true)

local localeConfig = serde.decode("toml", fs.readFile("../i18n/locales.toml"))
local catalog = serde.decode("toml", fs.readFile("../i18n/repository.toml"))
local template = fs.readFile("../repo/templates/README.md")

local function nested(root, path)
	local value = root
	for part in string.gmatch(path, "[^%.]+") do value = value[part] end
	return value
end

local function render(locale: string, links)
	local output = string.gsub(template, "{{%s*l10n:repository%.([%w_%.%-]+)%s*}}", function(key)
		local values = nested(catalog, key).values
		return values[locale] or values["en-US"] or error("Unknown localization key: repository." .. key)
	end)
	output = string.gsub(output, "{{%s*link:([%w_%.%-]+)%s*}}", function(key)
		return nested(links, key) or error("Unknown document link: " .. key)
	end)
	output = string.gsub(output, "{{%s*locales:repository%s*}}", function()
		local cells = {}
		for _, item in localeConfig.locales do
			if item.key ~= locale then table.insert(cells, `<td><a href="{links.locales[item.key]}">{item.language}</a></td>`) end
		end
		return "<table><tr>" .. table.concat(cells) .. "</tr></table>"
	end)
	return output
end

local repositoryRoot = "https://github.com/Kooraseru/vscode-editor-columns"
local repositoryRawRoot = "https://raw.githubusercontent.com/Kooraseru/vscode-editor-columns/HEAD"
fs.writeFile("../.heap/preview/repo/main/README.md", render("en-US", {
	icon = repositoryRawRoot .. "/assets/goofyaah.png", license = "LICENSE",
	marketplace = "https://marketplace.visualstudio.com/items?itemName=Kooraseru.vscode-editor-columns",
	locales = { ["ja-JP"] = repositoryRoot .. "/blob/HEAD/docs/ja-JP/README.md" },
}))
fs.writeFile("../.heap/preview/repo/main/docs/ja-JP/README.md", render("ja-JP", {
	icon = repositoryRawRoot .. "/assets/goofyaah.png", license = "../../LICENSE",
	marketplace = "https://marketplace.visualstudio.com/items?itemName=Kooraseru.vscode-editor-columns",
	locales = { ["en-US"] = repositoryRoot .. "/blob/HEAD/README.md" },
}))

local releaseFiles = {}
for _, file in fs.readDir("../releases/records") do if string.match(file, "%.md$") then table.insert(releaseFiles, file) end end
table.sort(releaseFiles, function(left, right) return left > right end)
local sections = {}
for _, file in releaseFiles do table.insert(sections, fs.readFile("../releases/records/" .. file)) end
fs.writeFile("../.heap/preview/repo/main/CHANGELOG.md", "# Changelog\n\n" .. table.concat(sections, "\n\n") .. "\n")
print("Built the generated main-branch projection in .heap/preview/repo/main/.")
