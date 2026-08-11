# Security notes

## Release signing

Release builds must be signed with a private keystore supplied by the build
environment. The Gradle build fails if the four `COLDKEEP_RELEASE_*` signing
variables are missing; it never falls back to the shared Android debug key.

Keep the keystore and its password outside the repository. The helper script
`scripts/build-release.ps1` supports a Windows-user DPAPI password file for
local builds and environment variables for CI.

## User data

ColdKeep requests microphone access only when recording starts. Recordings and
collection metadata are stored in the app-private directory. Android backup and
device transfer explicitly exclude the dataset. Dataset export is user-initiated
through the platform share sheet.

The release manifest does not request Internet access. The Internet permission
and cleartext traffic are limited to debug builds for the React Native packager.

## Dependency audit

`npm audit` currently reports advisories in transitive React Native development
tooling. These packages are not imported by the release JavaScript entry point,
but the audit should be rerun and reviewed when the React Native toolchain is
updated.

Please report security issues privately through GitHub's security reporting
mechanism rather than publishing exploit details in a public issue.
