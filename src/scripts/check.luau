local fs = require("@lune/fs")
local serde = require("@lune/serde")
local tooling = require("./tooling")

require("./compile")

local runtimeFiles = {
	"../.heap/cache/compiled/main/extension.js", "../.heap/cache/compiled/main/provider-host.js", "../.heap/cache/compiled/main/provider-registry.js", "../.heap/cache/compiled/main/state-coordinator.js",
	"../.heap/cache/compiled/main/bridge-protocol.js", "../.heap/cache/compiled/main/bridge-transport.js", "../.heap/cache/compiled/main/workbench-compatibility.js",
	"../.heap/cache/compiled/main/workbench-installer.js", "../.heap/cache/compiled/main/uninstall.js", "../.heap/cache/compiled/main/workbench-bridge.js",
}
for _, file in runtimeFiles do
	tooling.run("node", { "--check", file })
end

local manifest = serde.decode("json", fs.readFile("package.json"))
tooling.assert(manifest.main == "./src/extension.js", "The generated extension entry point must be src/extension.js.")
tooling.assert(manifest.types == "./src/api.d.ts", "The generated API declaration must be in src/.")
tooling.assert(manifest.editorColumnsToolchain.lune == "0.10.5", "The repository must pin Lune 0.10.5.")
tooling.assert(manifest.engines.vscode == ">=1.137.0", "The manifest must allow newer VS Code versions.")
tooling.assert(manifest.name == "vscode-editor-columns" and manifest.publisher == "Kooraseru", "Extension identity mismatch.")
tooling.assert(manifest.license == "ISC", "The package must use the ISC license.")
tooling.assert(manifest.icon == "assets/goofyaah.png" and fs.isFile("../assets/goofyaah.png"), "Extension icon mismatch.")
tooling.assert(fs.isFile("package-lock.json"), "package-lock.json is required.")

local bridge = fs.readFile("../.heap/cache/compiled/main/workbench-bridge.js")
tooling.assert(string.find(bridge, 'sourceHeader.textContent = "SOURCE"', 1, true) ~= nil, "SOURCE header is missing.")
tooling.assert(string.find(bridge, "definition.label", 1, true) ~= nil, "Provider label rendering is missing.")
tooling.assert(string.find(bridge, "__VSCODE_EDITOR_COLUMNS_GENERATED_CSS__", 1, true) == nil, "Generated CSS was not embedded.")
tooling.assert(string.find(bridge, "class WorkbenchCompatibility", 1, true) ~= nil, "Compatibility boundary is missing.")
tooling.assert(string.find(bridge, "fetch(", 1, true) == nil and string.find(bridge, "setInterval", 1, true) == nil,
	"Polling transport must not return.")
local css = fs.readFile("../.heap/cache/compiled/main/columns.css")
tooling.assert(string.find(css, "--vscode-editor-background", 1, true) ~= nil and string.find(css, "forced-colors", 1, true) ~= nil,
	"Generated CSS must retain theme and high-contrast behavior.")

for _, file in { "runtime/extension.ts", "runtime/workbench-installer.ts", "runtime/uninstall.ts" } do
	local source = fs.readFile(file)
	for _, forbidden in { "workbench.html", "connect-src", "Content-Security-Policy", "HTML_BRIDGE_MARKER", "htmlBackup" } do
		tooling.assert(string.find(source, forbidden, 1, true) == nil, "Installer runtime contains forbidden HTML/CSP behavior.")
	end
end

local readmeTemplate = fs.readFile("../repo/templates/README.md")
tooling.assert(string.find(readmeTemplate, '<div align="center">', 1, true) ~= nil and
	string.find(readmeTemplate, '<img src="{{ link:icon }}"', 1, true) ~= nil and
	string.find(readmeTemplate, "{{ locales:repository }}", 1, true) ~= nil, "README template contract failed.")
tooling.assert(fs.isFile("../repo/templates/AUTOMATION.md"), "Automation documentation is missing.")
tooling.assert(string.find(fs.readFile(".vscodeignore"), "docs/**", 1, true) == nil, "Localized docs must ship.")

local publication = serde.decode("json", fs.readFile("../releases/publication.json"))
local recordPath = "../releases/records/" .. publication.record .. ".md"
tooling.assert(fs.isFile(recordPath), "Publication record is missing.")
local expectedHeading = "# " .. publication.record .. "\n"
tooling.assert(string.sub(fs.readFile(recordPath), 1, #expectedHeading) == expectedHeading, "Release heading mismatch.")
tooling.assert(publication.version == manifest.version, "Publication version mismatch.")

local resolveRelease = require("./release-lib")
local release = resolveRelease("..")
tooling.assert(release.record == publication.record and release.version == manifest.version and release.tag == "v" .. manifest.version,
	"Release resolution failed.")

print("Source and package contract checks passed.")
