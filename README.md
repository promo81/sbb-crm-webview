# SBB CRM App

Mobile app repository: `promo81/sbb-crm-webview`

SBB CRM App is the Expo / React Native WebView wrapper for SalesPortal CRM.

- App name: `SBB CRM App`
- Package / bundle identifier: `it.sbbeauty.crm.mobile`
- Expo project slug: `sbb-crm-webview`
- Main app URL: `https://app.salesportal.it/agent/dashboard?native=1`

## Purpose

This app wraps SalesPortal CRM in a native mobile WebView and adds native capabilities around the web CRM experience.

Native capabilities currently include:

- Native CRM shell for the SalesPortal agent interface.
- GPS/geolocation bridge for check-in and mappa workflows.
- Push notification registration.
- Enriched device metadata registration.
- Google Maps external link handling.
- Notification open/deep-link bridge back into the CRM WebView.

## Current Production Status

`main` currently includes the GPS/push metadata work.

- Merged main commit: `fa487c9` (`Merge branch 'fix/gps-push-monitoring-20260708'`)
- Mobile feature commit: `06c6aec` (`fix: improve GPS bridge and push device metadata`)
- Artifact ignore commit: `ee3238d` (`chore: ignore local Android build artifacts`)
- Android internal testing: active
- Android version: `1.0.0 (6)`
- Google Play internal testing link: `https://play.google.com/apps/internaltest/4701440472449918461`
- Android AAB: uploaded to Google Play Console Internal testing
- iOS Apple Business / production build: pending

## Build Profiles

Build profiles are defined in `eas.json`.

- `preview`: internal Android APK build.
- `production`: Android App Bundle (`.aab`) for Google Play Store.
- `production` auto-increments `versionCode` through EAS remote app versioning.

Do not run EAS builds unless the task explicitly requires a mobile build.

## Artifact Policy

Do not commit APK/AAB build artifacts.

Local Android artifacts are ignored by `.gitignore`:

```gitignore
*.apk
*.aab
```

Example local artifacts that must remain uncommitted:

- `SBB_CRM_App_1.0.0_6.aab`
- `sbb-crm-preview.apk`

## Operational Status

Android Pixel metadata has been verified.

- Test executed by Francesco using the Roberta Ricci profile.
- Verified device: Pixel 9a / Android 16 / app `1.0.0`.
- Metadata bridge confirmed in SalesPortal `user_push_tokens`.
- OnePlus8Pro appeared as `Demo Test` / `test@test.com` because the device was logged in with that account.
- Do not make manual DB corrections for the OnePlus8Pro account association.
- To associate the OnePlus8Pro to Mattia, logout and login again with Mattia's real account.

## Pending Tasks

- Mattia Android real-login test.
- Clienti/Mappa/GPS/notifiche validation.
- Deborah Mariotti and Valeria Puccini still missing device app.
- iOS production / Apple Business build pending.
- GPS functional confirmation on client device pending.

## Useful Commands

Run local validation:

```bash
npm run lint
npx tsc --noEmit
```

Build commands, only when explicitly requested:

```bash
eas build --platform android --profile preview
eas build --platform android --profile production
```

Git inspection:

```bash
git status --short --branch
git log --oneline -5
```

## North Ops Reference

North Ops memory checkpoint:

- `project_slug`: `salesportal`
- `operational_memory id`: `6daec609-0f5c-4c72-b807-eb7f0568c7ee`
- `title`: `SBB CRM Android internal testing and Live Monitor Prod checkpoint`
