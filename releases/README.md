# Release Records

Release records use `YYYY.MM.N-KIND.md`, where `KIND` is `regular`, `hotfix`,
or `security`. Sequence numbers do not use leading zeroes.

`releases/build.lua` generates `CHANGELOG.md` by sorting and combining the
records. The generated public repository contains both the records and that
changelog.

`publication.json` binds the current record to the extension version and Git
tag. Setting `enabled` to `true` authorizes the post-CI publication workflow to
create that tag and GitHub release, attach the validated VSIX files, and publish
the extension package. Keep it `false` while a release is still being prepared.
