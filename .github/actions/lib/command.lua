local command = {}

function command.quote(value)
  return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

function command.run(root, program, quiet)
  if not quiet then io.stdout:write("+ ", program, "\n") end
  local ok, reason, code = os.execute("cd " .. command.quote(root) .. " && " .. program)
  if ok == true or ok == 0 or code == 0 then return true end
  return false, string.format("command failed (%s %s): %s", reason or "exit", code or ok or 1, program)
end

return command
