# iOS build from Windows

ColdKeep now has an iOS `AVAudioRecorder` bridge and uses the same application
ports as Android. Expo Go is not used because the recorder is custom native
code.

Windows cannot run Xcode locally, so use EAS Build for an iOS binary:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile preview
```

The first build asks for Apple signing credentials. A paid Apple Developer
account is required to install an IPA on a physical iPhone or distribute it
through TestFlight. The `preview` profile is for internal distribution; use
`production` for App Store builds.

This repository change is statically verified on Windows with TypeScript,
ESLint, and Jest. Swift compilation and microphone behavior still need to be
verified by the EAS build and on a physical iPhone.
