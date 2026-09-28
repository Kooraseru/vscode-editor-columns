local tooling = require("./tooling")
local process = require("@lune/process")

require("./compile")
tooling.run("node", { "--test", "../.heap/cache/tests/*.test.js" }, nil, { NODE_PATH = process.cwd .. "/../.heap/cache/node_modules" })
