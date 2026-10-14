local fs = require("@lune/fs")

for _, path in { "../.heap/preview", "../.heap/cache/tests", "../.heap/cache/compiled", "dist-tests" } do
	if fs.isDir(path) then
		fs.removeDir(path)
	end
end
print("Removed all generated extension output.")
