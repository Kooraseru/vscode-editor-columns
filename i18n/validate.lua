local script = arg[0]:gsub("\\", "/")
local root = script:match("^(.*)/i18n/validate%.lua$") or "."
package.path = root .. "/?.lua;" .. package.path

local render = require("i18n.render")
local locales, message = render.locales(root)
if not locales then io.stderr:write(message .. "\n"); os.exit(1) end

for _, name in ipairs({ "repository", "releases" }) do
  local catalog, catalog_error = render.catalog(root, name)
  if not catalog then io.stderr:write(catalog_error .. "\n"); os.exit(1) end
end
