# Contributing

Development happens on the canonical `source` branch. `main` is a generated
release projection and must not be used as a fork, pull-request base, or
development target. Fork the repository from `source`, create your branch from
`source`, and open pull requests back into `source`.

Before opening a pull request, run the **Validate source** VS Code task. It
checks localization catalogs, release-record identifiers, and the generated
public repository projection. Do not commit generated output, credentials, or
machine-specific paths.
