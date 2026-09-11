local render = {}

local function read(path)
  local file, message = io.open(path, "rb")
  if not file then return nil, message end
  local value = file:read("*a")
  file:close()
  return value
end

function render.locales(root)
  local value, message = read(root .. "/i18n/locales.toml")
  if not value then return nil, message end

  local locales, seen = {}, {}
  for body in value:gmatch("{(.-)}") do
    local key = body:match('key%s*=%s*"([^"]+)"')
    local language = body:match('language%s*=%s*"([^"]+)"')
    if not key or not language or seen[key] then
      return nil, "invalid or duplicate locale entry"
    end
    seen[key] = true
    locales[#locales + 1] = { key = key, language = language }
  end
  if #locales == 0 then return nil, "i18n/locales.toml contains no locales" end
  return locales
end

function render.catalog(root, name)
  local locales, locale_error = render.locales(root)
  if not locales then return nil, locale_error end
  local value, message = read(root .. "/i18n/" .. name .. ".toml")
  if not value then return nil, message end

  local sections, current = {}, nil
  for line in (value .. "\n"):gmatch("(.-)\r?\n") do
    local section = line:match("^%[([%w_.%-]+)%.values%]%s*$")
    if section then
      if sections[section] then return nil, "duplicate localization section: " .. section end
      sections[section] = {}
      current = sections[section]
    elseif line:match("^%s*$") or line:match("^%s*#") then
      -- Ignore blank lines and comments.
    else
      local locale, text = line:match('^([%w%-]+)%s*=%s*"(.*)"%s*$')
      if not current or not locale then return nil, "invalid localization value: " .. line end
      current[locale] = text:gsub("\\n", "\n")
    end
  end

  local default = locales[1].key
  for section, values in pairs(sections) do
    if not values[default] then
      return nil, name .. "." .. section .. " is missing " .. default
    end
  end
  return sections
end

function render.text(root, template, locale, links)
  local locales, locale_error = render.locales(root)
  if not locales then return nil, locale_error end
  local catalog, message = render.catalog(root, "repository")
  if not catalog then return nil, message end
  local failure = nil
  local output = template:gsub("{{%s*l10n:repository%.([%w_.%-]+)%s*}}", function(key)
    local values = catalog[key]
    local value = values and (values[locale] or values["en-US"])
    if not value then failure = "unknown localization key: repository." .. key end
    return value or ""
  end)
  if failure then return nil, failure end
  output = output:gsub("{{%s*link:([%w_.%-]+)%s*}}", function(key)
    local value = links and links[key]
    if not value then failure = "unknown document link: " .. key end
    return value or ""
  end)
  if failure then return nil, failure end
  output = output:gsub("{{%s*locales:repository%s*}}", function()
  local rows = {}

  for _, item in ipairs(locales) do
    if item.key ~= locale then
      local value = links and links.locales and links.locales[item.key]

      if not value then
        failure = "missing locale link: " .. item.key
        return ""
      end

      rows[#rows + 1] =
        "<td><a href=\"" .. value .. "\">" .. item.language .. "</a></td>"
      end
    end

    return "<table><tr>" .. table.concat(rows) .. "</tr></table>"
  end)
  if failure then return nil, failure end
  return output
end

return render
