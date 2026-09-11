#!/usr/bin/env lua
package.path = "./.github/actions/?.lua;" .. package.path

local command = require("lib.command")
local filesystem = require("lib.filesystem")
local version = "1.7.12"
local architecture = io.popen("uname -m"):read("*l")
local platform = architecture == "aarch64" and "arm64" or "amd64"
local checksums = {
  amd64 = "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
  arm64 = "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
}
local archive_name = "actionlint_" .. version .. "_linux_" .. platform .. ".tar.gz"
local expected = checksums[platform]
local tool_root = ".generated/actionlint"
local binary = tool_root .. "/actionlint-" .. platform
local archive = tool_root .. "/" .. archive_name

assert(command.run(".", "mkdir -p " .. command.quote(tool_root), true))
if not command.run(".", "test -x " .. command.quote(binary), true) then
  local url = "https://github.com/rhysd/actionlint/releases/download/v" .. version .. "/" .. archive_name
  local ok, message = command.run(".", "curl --fail --location --silent --show-error " .. command.quote(url) .. " --output " .. command.quote(archive))
  if not ok then io.stderr:write(message .. "\n"); os.exit(1) end
  local checksum = tool_root .. "/actionlint.sha256"
  local wrote, write_error = filesystem.write("./" .. checksum, expected .. "  " .. archive .. "\n")
  if not wrote then io.stderr:write(write_error .. "\n"); os.exit(1) end
  ok, message = command.run(".", "sha256sum --check --strict " .. command.quote(checksum))
  if not ok then io.stderr:write(message .. "\n"); os.exit(1) end
  ok, message = command.run(".", "tar -xzf " .. command.quote(archive) .. " -C " .. command.quote(tool_root) .. " actionlint && mv " .. command.quote(tool_root .. "/actionlint") .. " " .. command.quote(binary) .. " && chmod 700 " .. command.quote(binary))
  if not ok then io.stderr:write(message .. "\n"); os.exit(1) end
end

local ok, message = command.run(".", command.quote(binary) .. " -color")
if not ok then io.stderr:write(message .. "\n"); os.exit(1) end
