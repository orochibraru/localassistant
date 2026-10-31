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
- `/api/v1/notifications` reads the inbox (`GET`, with the unread count, also in
  the house payload), marks it read (`POST /read`), and removes one
  (`DELETE /[id]`) or all (`DELETE`).
- Device controls follow the web rule: `PendingChanges` shows a change at once,
  merges taps for 400 ms into one command, spins, and on failure falls back to
  the reading with the reason in red. No toasts or snackbars.
- Day to day through the `mobile:*` mise tasks (`.agents/notes/commands.md`).
  CI's build:
  `./gradlew :shared:testAndroidHostTest :androidApp:assembleDebug :shared:compileKotlinIosArm64`
  (the iOS Kotlin compiles on Linux; linking and the Swift shell need a Mac).
  The `mobile` job in `code_quality.yaml` runs it. `settings.gradle.kts` reads
  Maven Central through Google's mirror first: Maven Central answers shared IPs
  with 429s.
