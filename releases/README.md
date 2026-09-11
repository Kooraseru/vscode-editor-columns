# Release Records

Release records use `YYYY.MM.N-KIND.md`, where `KIND` is `regular`, `hotfix`,
or `security`. Sequence numbers do not use leading zeroes.

`releases/build.lua` generates `CHANGELOG.md` by sorting and combining the
records. The generated public repository contains both the records and that
changelog. This process does not publish GitHub Releases or modify branches.
