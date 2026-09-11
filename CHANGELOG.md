# Changelog

# 2026.09.1-regular

## Summary

Initial development release of VS Code Editor Columns. This release proves that
extensions can provide independently editable cells beside VS Code's native text
editor without replacing the editor or inserting generated values into source
text.

## Notable Changes

- Added a version-checked workbench bridge for VS Code 1.137.0.
- Preserved the native editor, gutter, minimap, context menus, selections,
  breakpoints, commands, and existing editor contributions.
- Added an extension-host API for registering multiple column providers.
- Added persistent provider headers and a `SOURCE` header for the native editor.
- Added per-visible-line cell values, editable-state control, column widths,
  document selectors, and provider-owned edit callbacks.
- Made the renderer bridge dormant unless the extension host is active.
- Added explicit activation, deactivation, installation, restoration, and
  uninstall cleanup paths.
- Added authenticated local communication between the extension host and the
  workbench renderer.
- Added localized English and Japanese repository documentation generation.
- Added `debug.vsix`, a development consumer that registers editable `ADDRESS`
  and `ENCODING` columns through the public provider API.

## Compatibility

The workbench bridge in this release supports VS Code 1.137.0 only. Installation
modifies the local VS Code workbench after first creating a byte-for-byte backup.
VS Code may display an installation-integrity warning while the bridge is
installed.

Consumer extensions must run in the same local extension host and declare
`Kooraseru.vscode-editor-columns` in `extensionDependencies` before using the
exported provider API.

## Verification

- Source and package-contract checks pass.
- The generated main-branch projection contains localized English and Japanese
  documentation, repository metadata, extension source, and this release record.
- The generated VSIX contains the ISC license, package metadata, extension icon,
  provider API declaration, extension host, uninstall lifecycle, and workbench
  renderer bridge.
- The release directory also contains `debug.vsix`, which exercises two
  simultaneous editable providers and the native `SOURCE` header.
- The previous always-on local proof-of-concept patch was removed before this
  extension-managed build.

## Known Limitations

- This is a pre-v1 development release and does not promise API compatibility.
- Durable per-editor cell state is not implemented yet.
- The bridge currently assumes absolute line numbers when mapping rendered
  gutter rows to source lines.
- Multi-window bridge routing and remote extension-host consumers are not yet
  supported.

