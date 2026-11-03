# Mobile app

- `apps/mobile` is a Kotlin Multiplatform app shaped like Penombre's: `shared`
  (Compose Multiplatform, Ktor, kotlinx-serialization) with `androidMain` and
  `iosMain`, the `androidApp` shell, and `iosApp`, an `xcodegen` project
  (`project.yml`; the `.xcodeproj` and `Info.plist` are generated and ignored).
  The no-comments rule holds there too; public functions get a one-line KDoc.
- Sign-in: PKCE through the system browser sheet to `/mobile/authorize` (under
  `(protected)/`, so a signed-out phone signs in first), which redirects to
  `localassistant://auth?code&state`; or a pairing link
  `localassistant://pair?server&code` from **Account, Mobile app**, which needs
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
- Scenes come with the house payload, members included; `POST /api/v1/scenes`
  makes one, `PUT` and `DELETE /api/v1/scenes/[id]` change and remove it, all
  through `library.saveScene`. `GET /api/v1/cameras/[id]` gives a camera's live
  path, snapshot and `devices.clips()`; pictures and video come from `/media`
  with the bearer header, played by Media3 on Android and `AVPlayer` on iOS.
- Admin device setup goes through `deviceAdmin` (`#lib/server/devices/`), shared
  with the `/devices` form actions: `GET /api/v1/setups`, `POST .../connect`,
  `.../discover`, `.../devices` and `DELETE /api/v1/setups/[pluginId]`, and
  `PUT`/`DELETE /api/v1/devices/[id]`. Bodies are the web form's flat fields as
  JSON strings (`name`, `roomId`, `ownerId`, `value:<field>`), checked by the
  same schemas; a refusal answers `{ message, errors }` per field.
- The Android updater reads the latest GitHub release, compares it with
  `appVersion` and installs the APK through a `PackageInstaller` session
  (`UpdateReceiver` shows the confirmation). It only runs when the installer
  isn't a store and the build isn't debuggable.
- `/api/v1/notifications` reads the inbox (`GET`, with the unread count, also in
  the house payload), marks it read (`POST /read`), and removes one
  (`DELETE /[id]`) or all (`DELETE`).
- Phone notifications: on Android with a UnifiedPush distributor, the connector
  makes Web Push keys and an endpoint that the app registers with
  `PUT /api/v1/mobile/push` (VAPID key from `GET`), so the server pushes to it
  through the same `push_subscription` table as browsers; otherwise a 15-minute
  WorkManager job, and on iOS a `BGAppRefreshTask`, read the inbox and post
  what's newer than the last id seen.
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
- Releases attach a signed APK and an unsigned IPA to the GitHub release
  (`publish.yaml`, `.agents/notes/ci-releases.md`).
