# Tutera-X Android app (Trusted Web Activity)

A phone shortcut to the website still shows Chrome's address bar and three-dot menu, and
Android names it after the page title ("Overview · Tutera-X"). A Trusted Web Activity (TWA)
is a small Android app that opens the live website full screen with no browser bar. The
app's name comes from the Android project (`Tutera-X`), so the install name and the launcher
label are correct.

This change only affects the phone app. The website's desktop layout is not touched.

## Before you start

- Deploy the site with `public/.well-known/assetlinks.json` included. Until the fingerprint is
  in that file, Android will not trust the app and it will open with the browser bar.
- On the phone, remove the old "Overview · Tutera-X" shortcut first.

## Steps

1. Install Node 20+. Bubblewrap will offer to install Java 17 and the Android SDK for you.
   `npm i -g @bubblewrap/cli`
2. Create the Android project from the live manifest:
   `cd twa && bubblewrap init --manifest https://tuterax.vercel.app/manifest.webmanifest`
   If it asks about the package name, use `com.tutera.x`. If it asks about the keystore, accept
   `./android.keystore` and choose a strong password. Keep the keystore and its password safe.
   Losing them means the app can never be updated.
3. Make sure the generated `twa-manifest.json` matches the one in this folder (package
   `com.tutera.x`, name `Tutera-X`, splash colour `#f5f3ff`). Copy any differences back in.
4. Build: `bubblewrap build`. This produces `app-release-signed.apk` (and an `.aab` for Play).
5. Read the fingerprint and write it into the website's verification file:
   `sh set-fingerprint.sh android.keystore tutera-x`
   Then redeploy the site and check
   `https://tuterax.vercel.app/.well-known/assetlinks.json` shows the fingerprint.
6. Install: `bubblewrap install`, or copy the APK to the phone and open it.

## Alternative without the command line

Go to pwabuilder.com, enter `https://tuterax.vercel.app`, choose Android, and use package
`com.tutera.x`. Then do step 5 with the keystore it gives you.

## About the splash screen

A TWA shows its own launch screen while the site loads. Bubblewrap builds that screen from the
app icon on the splash background colour, so it should show the icon and no text. This has not
been checked on a device yet. Please confirm after installing. If a label still appears under the
icon, it comes from the Android version on that phone, not the website, and the fix would be a
custom splash theme in the Android project.

## Updating later

Raise `appVersionCode` and `appVersion` in `twa-manifest.json`, run `bubblewrap build`, and
install the new APK. Website changes need no new build, because the app loads the live site.
