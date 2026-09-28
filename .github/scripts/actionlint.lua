#!/usr/bin/env lua
package.path = "./.github/actions/?.lua;" .. package.path

local command = require("lib.command")
local version = "v1.7.12"
local ok, message = command.run(".", "go run github.com/rhysd/actionlint/cmd/actionlint@" .. version .. " -color")
if not ok then io.stderr:write(message .. "\n"); os.exit(1) end
