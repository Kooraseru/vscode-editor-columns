local script = arg[0]:gsub("\\", "/")
local root = script:match("^(.*)/%.github/actions/validate/main%.lua$") or "."
package.path = root .. "/?.lua;" .. root .. "/.github/actions/?.lua;" .. package.path

local command = require("lib.command")
local required = {
  "code", "i18n/locales.toml", "i18n/repository.toml", "i18n/releases.toml", "i18n/render.lua",
  "repo/build.lua", "repo/config.toml", "repo/templates/README.md",
  "releases/build.lua", "releases/validate.lua", "releases/test.lua", "releases/records",
  "LICENSE", "CITATION.cff", ".github/actions",
}

for _, path in ipairs(required) do
  if not os.rename(root .. "/" .. path, root .. "/" .. path) then
    io.stderr:write("missing required path: " .. path .. "\n")
    os.exit(1)
  end
end

local programs = {
  "find i18n repo releases .github/actions -name '*.lua' -print0 | xargs -0 -n1 luac5.4 -p",
  "lua5.4 i18n/validate.lua",
  "lua5.4 releases/test.lua",
  "lua5.4 repo/build.lua " .. command.quote(os.getenv("GENERATED_DESTINATION") or ".generated"),
}

-- Windows-mounted WSL worktrees often preserve CRLF; enforce this only in the Linux CI checkout.
if os.getenv("CHECK_EOL") == "true" then
  table.insert(programs, 1, "git diff --check")
end

for _, program in ipairs(programs) do
  local ok, message = command.run(root, program)
  if not ok then io.stderr:write(message .. "\n"); os.exit(1) end
end
