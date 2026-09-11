# Release Records

Release records use `YYYY.MM.N-KIND.md`, where `KIND` is `regular`, `hotfix`,
or `security`. Sequence numbers do not use leading zeroes.

`releases/build.lua` generates `CHANGELOG.md` by sorting and combining the
records. The generated public repository contains both the records and that
changelog.

`publication.json` binds the current record to the extension version and Git
tag. Setting `enabled` to `true` authorizes the post-CI publication workflow to
replace any existing GitHub release and tag with that name, create the release
from the current validated source commit, attach the validated VSIX files, and
publish the extension package. Marketplace deployment is held by the
`marketplace` environment approval and uses GitHub OIDC with the
environment-scoped `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` variables. Keep
publication disabled while a release is still being prepared.
