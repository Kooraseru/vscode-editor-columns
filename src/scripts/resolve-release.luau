local fs = require("@lune/fs")
local process = require("@lune/process")
local serde = require("@lune/serde")
local resolveRelease = require("./release-lib")

local release = resolveRelease(".")
local output = `enabled={tostring(release.enabled)}\nrecord={release.record}\nversion={release.version}\ntag={release.tag}\n`
if process.env.GITHUB_OUTPUT then
	fs.writeFile(process.env.GITHUB_OUTPUT, output, { append = true })
else
	print(serde.encode("json", release))
end
