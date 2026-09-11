local releases = {}

function releases.parse_id(value)
  if type(value) ~= "string" then return nil end
  local year, month, sequence, kind = value:match("^(%d%d%d%d)%.(%d%d)%.([1-9]%d*)%-(%a+)$")
  if not year then return nil end
  month, sequence = tonumber(month), tonumber(sequence)
  if month < 1 or month > 12 then return nil end
  if kind ~= "regular" and kind ~= "hotfix" and kind ~= "security" then return nil end
  return { year = tonumber(year), month = month, sequence = sequence, kind = kind }
end

function releases.valid_id(value)
  return releases.parse_id(value) ~= nil
end

function releases.validate(root, version)
  if not releases.valid_id(version) then return false, "invalid release ID: " .. tostring(version) end
  local file = io.open(root .. "/releases/records/" .. version .. ".md", "r")
  if not file then return false, "missing authored release record: " .. version end
  file:close()
  return true
end

return releases
