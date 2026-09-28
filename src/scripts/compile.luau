local fs = require("@lune/fs")
local serde = require("@lune/serde")
local tooling = require("./tooling")

tooling.run("node", { "../.heap/cache/node_modules/typescript/bin/tsc", "-p", "tsconfig.json" })
tooling.run("node", { "../.heap/cache/node_modules/typescript/bin/tsc", "-p", "tsconfig.workbench.json" })
tooling.run("node", { "../.heap/cache/node_modules/sass/sass.js", "--no-source-map", "styles/columns.scss", "../.heap/cache/compiled/main/columns.css" })

if fs.isDir("../.heap/cache/tests") then
	fs.removeDir("../.heap/cache/tests")
end
tooling.run("node", { "../.heap/cache/node_modules/typescript/bin/tsc", "-p", "tsconfig.tests.json" })

local bridgePath = "../.heap/cache/compiled/main/workbench-bridge.js"
local placeholder = serde.encode("json", "__VSCODE_EDITOR_COLUMNS_GENERATED_CSS__")
local css = serde.encode("json", fs.readFile("../.heap/cache/compiled/main/columns.css"))
fs.writeFile(bridgePath, tooling.replacePlain(fs.readFile(bridgePath), placeholder, css))
