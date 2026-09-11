local filesystem = {}

function filesystem.read(path)
  local file, message = io.open(path, "rb")
  if not file then return nil, message end
  local value = file:read("*a")
  file:close()
  return value
end

function filesystem.write(path, value)
  local file, message = io.open(path, "wb")
  if not file then return false, message end
  file:write(value)
  file:close()
  return true
end

return filesystem
