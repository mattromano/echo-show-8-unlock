# Echo Show 8 Unlock

Turning a kitchen **Amazon Echo Show 8 (1st gen, 2019, codename `crown`)** into a custom
media / dashboard screen by unlocking the bootloader with the amonet exploit, then either:

- **Option A:** jailbroken Fire OS. Alexa keeps working, and apps can be sideloaded.
- **Option B:** unofficial LineageOS 18.1 (Android 11) with Alexa removed.

## Device

| | |
|---|---|
| Model | Echo Show 8, 1st gen (2019), `crown` (MediaTek MT8163) |
| Fire OS at start | 6.5.7.4 (the newest version the guide reports as working) |
| Wi-Fi | Keep **off** until the unlock is done, so an OTA update can't patch the exploit |
| Connection | micro-USB to Windows 11 PC |

## Layout

```
docs/runbook.md        step-by-step checklist with progress log
scripts/check-device.ps1  shows whether the Echo is visible over adb / fastboot
downloads/             XDA files go here (gitignored)
backups/               TWRP backups go here (gitignored)
tools/platform-tools/  Google adb + fastboot (gitignored; see below)
```

## Setup

Android SDK Platform Tools came from Google
(`https://dl.google.com/android/repository/platform-tools-latest-windows.zip`).
Version 37.0.1, Authenticode signed by Google LLC. Unzip it into `tools/`.

## Sources

- Derek Seaman's guide: https://www.derekseaman.com/2025/11/home-assistant-hacking-your-echo-show-5-and-8.html
- XDA unlock / root / TWRP thread: https://xdaforums.com/t/unlock-root-twrp-unbrick-amazon-echo-show-8-1st-gen-2019-crown.4766687/
- XDA LineageOS 18.1 ROM thread: https://xdaforums.com/t/rom-unofficial-11-crown-lineageos-18-1-for-the-amazon-echo-show-8-2019.4766709/
- Device tree: https://github.com/amazon-oss/android_device_amazon_crown
- Camera fix: https://github.com/jxlarrea/lineageos-echo-show-camera

## Warnings

- Only use files built for **crown**. The checkers and cronos (Echo Show 5) files have the same names but different contents, and flashing them causes a boot loop.
- In TWRP, wipe **only** system, data and cache.
- Back up in TWRP before flashing a ROM, and copy the backup to `backups/`.
