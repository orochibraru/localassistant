# Mobile app

- `apps/mobile` is a Kotlin Multiplatform app shaped like Penombre's: `shared`
  (Compose Multiplatform, Ktor, kotlinx-serialization) with `androidMain` and
  `iosMain`, the `androidApp` shell, and `iosApp`, an `xcodegen` project
  (`project.yml`; the `.xcodeproj` and `Info.plist` are generated and ignored).
  The no-comments rule holds there too; public functions get a one-line KDoc.
- Sign-in: PKCE through the system browser sheet to `/mobile/authorize` (under
  `(protected)/`, so a signed-out phone signs in first), which redirects to
  `localassistant://auth?code&state`; or a pairing link
  `localassistant://pair?server&code` from **Account, This device**, which needs
  `signedInRecently`. Both codes are single-use rows in `verification`
  (`MobileCodeDTO`, hashed), and `POST /api/v1/mobile/token` trades them for a
  better-auth session, rate limited per address. `DELETE` on it signs out.
- The token is the session token: better-auth's `bearer()` plugin turns
  `Authorization: Bearer` into the session cookie, so `locals.user` and
  `access.requireUser()` work unchanged, and the session gate still applies.
- `/api/v1` endpoints are JSON, guarded by `access.requireUser()`, bodies read
  with `mobileApi.body(request, schema)`. `?home=` picks a home when several are
  on. Every mutating call must send `content-type: application/json`, or
  `csrfHandler` takes it for a cross-site form.
- Device controls follow the web rule: `PendingChanges` shows a change at once,
  merges taps for 400 ms into one command, spins, and on failure falls back to
  the reading with the reason in red. No toasts or snackbars.
- Builds:
  `./gradlew :shared:testAndroidHostTest :androidApp:assembleDebug :shared:compileKotlinIosArm64`
  (the iOS Kotlin compiles on Linux; linking and the Swift shell need a Mac).
  The `mobile` job in `code_quality.yaml` runs it. If Maven Central answers 429
  locally, point Gradle at Google's mirror of it with an init script.
