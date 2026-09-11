local script = arg[0]:gsub("\\", "/")
local root = script:match("^(.*)/repo/build%.lua$") or "."
package.path = root .. "/?.lua;" .. root .. "/.github/actions/?.lua;" .. package.path

local command = require("lib.command")
local filesystem = require("lib.filesystem")
local i18n = require("i18n.render")

local destination = arg[1] or (root .. "/.generated")
if destination == "" or destination == "." or destination == root or destination == "/" then
  io.stderr:write("refusing unsafe generated-repository destination\n")
  os.exit(2)
end

local template, message = filesystem.read(root .. "/repo/templates/README.md")
if not template then io.stderr:write(message .. "\n"); os.exit(1) end
local locales, locale_error = i18n.locales(root)
if not locales then io.stderr:write(locale_error .. "\n"); os.exit(1) end

local ok, command_error = command.run(root,
  "rm -rf " .. command.quote(destination) .. " && mkdir -p " .. command.quote(destination), true)
if not ok then io.stderr:write(command_error .. "\n"); os.exit(1) end

ok, command_error = command.run(root,
  "mkdir -p " .. command.quote(destination .. "/docs")
    .. " && cp -R code " .. command.quote(destination .. "/src")
    .. " && cp -R .github " .. command.quote(destination .. "/.github")
    .. " && cp -R LICENSES " .. command.quote(destination .. "/LICENSES")
    .. " && cp -R releases/records " .. command.quote(destination .. "/releases")
    .. " && cp LICENSE NOTICE CITATION.cff repo/templates/CONTRIBUTING.md"
    .. " repo/templates/CODE_OF_CONDUCT.md repo/templates/SECURITY.md " .. command.quote(destination), true)
if not ok then io.stderr:write(command_error .. "\n"); os.exit(1) end

ok, command_error = command.run(root,
  "lua5.4 releases/build.lua " .. command.quote(destination .. "/CHANGELOG.md"), true)
if not ok then io.stderr:write(command_error .. "\n"); os.exit(1) end

for index, locale in ipairs(locales) do
  local links = {
    license = index == 1 and "LICENSE" or "../../LICENSE",
    contributing = index == 1 and "CONTRIBUTING.md" or "../../CONTRIBUTING.md",
    locales = {},
  }
  
  for _, target in ipairs(locales) do
    if target.key ~= locale.key then
      if target.key == "en-US" then
        links.locales[target.key] = "../../README.md"
      elseif locale.key == "en-US" then
        links.locales[target.key] = "docs/" .. target.key .. "/README.md"
      else
        links.locales[target.key] = "../" .. target.key .. "/README.md"
      end
    end
  end

  local rendered, render_error = i18n.text(root, template, locale.key, links)
  if not rendered then io.stderr:write(render_error .. "\n"); os.exit(1) end
  local document = index == 1 and (destination .. "/README.md")
    or (destination .. "/docs/" .. locale.key .. "/README.md")
  if index > 1 then
    ok, command_error = command.run(root, "mkdir -p " .. command.quote(destination .. "/docs/" .. locale.key), true)
    if not ok then io.stderr:write(command_error .. "\n"); os.exit(1) end
  end
  local written, write_error = filesystem.write(document, rendered)
  if not written then io.stderr:write(write_error .. "\n"); os.exit(1) end
end

io.stdout:write("Built generated repository at ", destination, "\n")
