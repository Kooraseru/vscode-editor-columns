# Automation

```mermaid
flowchart LR
    PR["Pull Request<br/>→ source"]
    PUSH["Push / Merge<br/>→ source"]
    CONTRACTS["Repository Contracts"]
    EXT["Extension"]
    TESTS["Tests"]
    LOC["Localization"]
    RELEASESYS["Release System"]
    ACTIONS["GitHub Actions"]
    DEP["Dependency Review<br/>(PR only)"]
    BUILD["Build Generated Repository"]
    PACKAGE["Package Extension<br/>VSIX"]
    GATE["Pipeline Gate"]
    MAIN["Publish Generated State<br/>→ main"]
    RESOLVE["Resolve Release<br/>date + version + tag"]
    TAG["Validate / Handle Tag"]
    NOTES["Build Release Notes<br/>PRs + metadata"]
    GHREL["Publish GitHub Release"]
    ASSET["Attach VSIX"]
    PKG["Publish Package"]
    PAGES["Publish Pages<br/>(later)"]
    WIKI["Publish Wiki<br/>(later)"]

    PR --> CONTRACTS
    PUSH --> CONTRACTS
    PR -.-> DEP
    CONTRACTS --> EXT
    CONTRACTS --> LOC
    CONTRACTS --> RELEASESYS
    CONTRACTS --> ACTIONS
    EXT --> TESTS
    TESTS --> BUILD
    LOC --> BUILD
    RELEASESYS --> BUILD
    ACTIONS --> BUILD
    BUILD --> PACKAGE
    PACKAGE --> GATE
    DEP -.-> GATE
    GATE -->|push to source only| MAIN
    GATE -->|push to source only| RESOLVE
    RESOLVE --> TAG
    TAG --> NOTES
    NOTES --> GHREL
    PACKAGE --> ASSET
    GHREL --> ASSET
    GATE -->|push to source only| PKG
    GATE -.->|later| PAGES
    GATE -.->|later| WIKI
```

`CI` validates pull requests and source pushes as distinct jobs, then publishes
the generated repository and VSIX files as immutable workflow artifacts. A
successful source push triggers the separate `Publish` workflow, which updates
`main` from the validated repository artifact.

Release publication is declared in `releases/publication.json`. The release
resolver validates the record, extension version, and tag on every run. GitHub
Release creation, VSIX attachment, and Marketplace publication occur only when
`enabled` is `true`; Marketplace publication additionally requires the
`VSCE_PAT` repository secret.

Pages and Wiki publication are reserved for later work and are not represented
by placeholder jobs.
