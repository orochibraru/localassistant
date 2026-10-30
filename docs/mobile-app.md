# Mobile app

LocalAssistant has a native app for Android and iPhone, built with Kotlin
Multiplatform. It shows the house, drives devices, sets scenes, runs routines,
talks to the assistant and reports the phone's battery and, if you share it,
whether you're home. The web app still installs on phones too.

## Sign in

Either way ends in an ordinary session, listed under **Account, Security** with
the browser ones, where you can sign it out.

- **With the server's address**: type it in the app and tap **Sign in**. A
  browser sheet opens the server, where you sign in as usual (passkeys and
  authenticator apps included) and tap **Sign in** on the question the server
  asks. The sheet closes and the app is signed in.
- **With a pairing code**: in a signed-in browser, open **Account, This device**
  and tap **Show a pairing code**. Scan it with the app, or with the phone's
  camera. The code works once, for two minutes, and needs a recent sign-in.

On plain HTTP the address must start with `http://`; without a scheme the app
assumes HTTPS.

## This phone in the house

**Settings** in the app adds the phone to the house, owned by you. It then sends
its battery every five minutes while the app is open and, once you turn on
**Share the location** and allow it, its position, which marks you home or away
for routines and the people on Home.

## For developers

The app lives in `apps/mobile`: a `shared` Compose Multiplatform module, the
`androidApp` shell and the `iosApp` one (an `xcodegen` project). It talks to the
server's `/api/v1` with the session token as a bearer token.

```bash
cd apps/mobile
./gradlew :shared:testAndroidHostTest :androidApp:assembleDebug
```

For iOS, run `xcodegen` in `apps/mobile/iosApp` and open the project in Xcode.
