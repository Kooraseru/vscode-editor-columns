local script = arg[0]:gsub("\\", "/")
local root = script:match("^(.*)/releases/build%.lua$") or "."
package.path = root .. "/?.lua;" .. package.path

local releases = require("releases.validate")
local destination = arg[1]
if not destination or destination == "" then
  io.stderr:write("usage: lua5.4 releases/build.lua DESTINATION\n")
  os.exit(2)
end

local files = {}
local stream = io.popen("find " .. string.format("%q", root .. "/releases/records")
  .. " -maxdepth 1 -type f -name '*.md' -printf '%f\\n' | sort -r")
if not stream then
  io.stderr:write("unable to list release records\n")
  os.exit(1)
end
for name in stream:lines() do
  local id = name:match("^(.*)%.md$")
  if not releases.valid_id(id) then
    io.stderr:write("invalid release record filename: " .. name .. "\n")
    stream:close()
    os.exit(1)
  end
  files[#files + 1] = { id = id, path = root .. "/releases/records/" .. name }
end
stream:close()

local output = { "# Changelog\n" }
for _, record in ipairs(files) do
  local file, message = io.open(record.path, "rb")
  if not file then io.stderr:write(message .. "\n"); os.exit(1) end
  local content = file:read("*a")
  file:close()
  output[#output + 1] = "\n" .. content:gsub("%s+$", "") .. "\n"
end

local file, message = io.open(destination, "wb")
if not file then io.stderr:write(message .. "\n"); os.exit(1) end
file:write(table.concat(output))
file:close()
