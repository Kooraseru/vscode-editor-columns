local fs = require("@lune/fs")
local serde = require("@lune/serde")
local tooling = require("./tooling")

return function(root: string?)
	root = root or "."
	local publication = serde.decode("json", fs.readFile(root .. "/releases/publication.json"))
	local extension = serde.decode("json", fs.readFile(root .. "/src/package.json"))
	local prefix, kind = string.match(publication.record, "^(%d%d%d%d%.%d%d%.[1-9]%d*)%-(%a+)$")
	tooling.assert(prefix ~= nil and (kind == "regular" or kind == "hotfix" or kind == "security"),
		"Invalid release record ID: " .. tostring(publication.record))
	tooling.assert(string.match(publication.version, "^%d+%.%d+%.%d+[%w%.%-]*$") ~= nil,
		"Invalid extension version: " .. tostring(publication.version))
	tooling.assert(publication.version == extension.version,
		`Publication version {publication.version} does not match extension version {extension.version}.`)
	tooling.assert(publication.tag == "v" .. publication.version, "Publication tag must be v" .. publication.version .. ".")
	tooling.assert(fs.isFile(root .. "/releases/records/" .. publication.record .. ".md"), "Release record is missing.")
	return { enabled = publication.enabled == true, record = publication.record, version = publication.version, tag = publication.tag }
end
