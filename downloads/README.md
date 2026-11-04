Put the XDA files here. This folder's contents are gitignored.

- `amonet-crown.zip`
- crown `boot-root.zip`
- crown LineageOS 18.1 zip

APKs go in `apks/`. For Hulu (`com.hulu.plus`) and Peacock (`com.peacocktv.peacockandroid`), the Echo needs a version that
supports **Android 7.1 (API 25)** and **armeabi-v7a** (or universal/nodpi). `.apk`, `.apkm` and `.xapk` bundles are all fine.

Picks checked on APKMirror (2026-11-04):

| App | Version | Why |
|---|---|---|
| Hulu, Amazon Appstore **Fire Tablet** build | 6.31.0+17377884-amazon (21.4 MB, universal incl. armeabi-v7a, min API 25) | https://www.apkmirror.com/apk/disney/hulu-amazon-appstore-fire-tablet-version/hulu-amazon-appstore-fire-tablet-version-6-31-017377884-amazon-release/ |
| Peacock, Amazon Appstore **Fire Tablet** build | 6.11.11 (**armeabi-v7a**, Android 7.0+, Nov 2025). The 7.x builds are arm64 only. | https://www.apkmirror.com/apk/peacock-tv-llc/peacock-amazon-appstore-fire-tablet-version/peacock-amazon-appstore-fire-tablet-version-6-11-11-release/ |
| Spotify | 9.1.x (Android 7.0+). Pick the armeabi-v7a variant or the bundle. | https://www.apkmirror.com/?p=13115967 |

Record each file's SHA256 in `docs/runbook.md` (`Get-FileHash <file>`).
