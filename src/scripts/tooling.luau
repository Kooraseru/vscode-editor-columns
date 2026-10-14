local fs = require("@lune/fs")
local process = require("@lune/process")

local tooling = {}

function tooling.run(program: string, arguments: { string }, cwd: string?, environment: { [string]: string }?)
	local options = { cwd = cwd, env = environment, stdio = "inherit" }
	if process.os == "windows" then options.shell = true end
	local result = process.exec(program, arguments, options)
	if not result.ok then
		process.exit(result.code)
	end
end

function tooling.assert(condition: any, message: string)
	if not condition then
		error(message, 2)
	end
end

function tooling.exists(path: string): boolean
	return fs.isFile(path) or fs.isDir(path)
end

function tooling.replacePlain(source: string, needle: string, replacement: string): string
	local startIndex, endIndex = string.find(source, needle, 1, true)
	tooling.assert(startIndex ~= nil and endIndex ~= nil, "Expected generated placeholder was not found: " .. needle)
	return string.sub(source, 1, startIndex - 1) .. replacement .. string.sub(source, endIndex + 1)
end

return tooling
