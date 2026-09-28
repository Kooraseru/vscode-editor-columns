local fs = require("@lune/fs")
local process = require("@lune/process")
local tooling = require("./tooling")

local fromBuild = false
for _, argument in process.args do if argument == "--from-build" then fromBuild = true end end
if not fromBuild then
	require("./check")
	require("./build")
end

fs.writeDir("../.heap/preview/release")
local vsceVersion = "3.9.2"
tooling.run("npm", { "ci", "--omit=dev", "--ignore-scripts", "--cache", "../../../cache/npm" }, "../.heap/preview/repo/main")
tooling.run("npm", {
	"exec", "--loglevel", "error", "--no-update-notifier", "--cache", "../../../cache/npm", "--yes",
	"--package", "@vscode/vsce@" .. vsceVersion, "--", "vsce", "package", "--allow-missing-repository",
	"--out", "../../release/vscode-editor-columns-0.1.0.vsix",
}, "../.heap/preview/repo/main")
if fs.isDir("../.heap/preview/repo/main/node_modules") then fs.removeDir("../.heap/preview/repo/main/node_modules") end
print("Packaged distributables in .heap/preview/release/ and removed temporary package dependencies.")
