# Echo Show 5 1st gen (checkers) unlock notes

These are my own notes, read on 2026-11-04. The thread is
[UNLOCK][ROOT][TWRP][UNBRICK] Amazon Echo Show 5 1st Gen - 2019 (checkers), by Rortiz2:
https://xdaforums.com/t/unlock-root-twrp-unbrick-amazon-echo-show-5-1st-gen-2019-checkers.4762900/
It had 19 pages, and the first post was last edited 2026-11-03.
It is the same exploit and the same developer as the Show 8 (`crown`) unlock; see `xda-unlock-thread-notes.md`.

Always re-read the first post and the last page of the thread before acting.

## Firmware status

- **Our Show 5 is on Fire OS 6.5.7.1.** That is older than the patch, so it is still vulnerable.
- **Fire OS 6575.1 (NS65751/8848) patches the exploit** on the Show 5 1st gen, Show 8 1st gen and Show 5 2nd gen (developer, 2026-11-03).
- Once unlocked, TWRP stops future updates from removing the unlock.
- **Keep Wi-Fi off from now until it's unlocked. Boot straight into fastboot.**
- This model only: H23K37, 2019 Echo Show 5 1st gen. Check the label on the bottom and `getvar product` (should be CHECKERS).

## Files (attachments; XDA attachments need a signed-in browser)

| File | Size | Where |
|---|---|---|
| `amonet-checkers-v2.0.2.zip` | 60.7 MB | Post #1, current release |
| `amonet-checkers-v1.1.6.zip` | 58.6 MB | Post #1, fallback (see below) |
| `boot-root.zip` (checkers) | 7.5 MB | Post #2. **Not** the crown `boot-root.zip` from the Show 8 folder. |

Never use the `amonet-crown` or `amonet-cronos` packages or crown files on this device.

## Package review (2026-11-04)

Saved in `echo-show-8-unlock\downloads\downloads\` (gitignored). v1.1.6 was not downloaded; get it only if v2.0.2 loops.

| File | Size | SHA256 |
|---|---|---|
| `amonet-checkers-v2.0.2.zip` | 63,615,934 bytes | `4d047f4045fb6c9954076a3721a7a48e9a37a7d679bac97e326d7bf987bf0cc9` |
| `boot-root.zip` (checkers, post #2) | 7,875,709 bytes | `b2474113a1f3a4a8de6728ff72774761051945641e1a5ffa78ee25c2b19a809e` |

- `device.prop`: `DEVICE=checkers`, "Amazon Echo Show 5 (2019 / 1st Gen)", `DEVICE_TYPE_ID=A4ZP7ZC4PI6TO`. Right package for this model.
- Compared with `R0rt1z2/amonet` branch `mt8163-echo-show` at `d6179b8` (latest; fetched 2026-11-04):
  - Identical: `fastbrick.bat`, `bootrom-step.sh`, `fastboot-step.sh`, `boot-*.sh`, `fastbrick/checkers/profile.*`, the other `modules/*.py`, `META-INF` updater.
  - `fastbrick.ps1` / `fastbrick.sh`: the only addition is `Check-Patched`, which reads `lk_build_desc` and **exits without touching the device** if the bootloader was built in 2026 or later (patched firmware). A safety check, nothing else.
  - `modules/common.py`, `modules/main.py`: the older one-block-at-a-time eMMC writer, only used by the Linux bootrom path (Option 2). Same as the crown package.
- All four scripts and both modules are **byte-identical to `amonet-crown-v2.0.2`**, which unlocked our Show 8. The bundled `fastboot.exe` and ADB DLLs have the same hashes too.
- `bin/twrp.img` SHA256 `dcc75bb6…ae59f5` matches the hash a checkers user posted on the thread (2026-11-03) for TWRP 3.7.0_9-0.
- `boot-root.img` is an Android boot image (cmdline `bootopt=64S3,32N2,32N2 buildvariant=user`). Compare it with our own stock boot after the unlock (`scripts/compare-bootimg.ps1`, as for the Show 8) before flashing it.

## Unlock (Option 1, same as the Show 8)

1. The Kindle Fire driver is already installed on this PC from the Show 8.
2. Extract the amonet zip and run `fastbrick.bat` yourself in the Terminal panel.
3. With the charger connected, hold **all three buttons** until `=> FASTBOOT mode...` appears.
4. Connect micro-USB (use a **USB 2.0 port** if there is one; the developer says they succeed more often). Type `YES` when asked.
5. **After the 10-second grace period, do not interrupt. An interruption is a permanent brick.** Up to 5 minutes, then it reboots into TWRP.

## Runbook

- [x] Fire OS 6.5.7.1 confirmed (older than the 6575.1 patch). Wi-Fi off.
- [x] Package reviewed (above).
- [ ] Extract `amonet-checkers-v2.0.2.zip` to `downloads\downloads\amonet-checkers-v2.0.2\` (I do this).
- [ ] **You:** unplug the Show 5, hold all three buttons, plug in power, keep holding until `=> FASTBOOT mode...`.
- [ ] I check `fastboot getvar product` / `lk_build_desc` (read-only) so we know it's CHECKERS and a pre-2026 LK.
- [ ] **You:** run `fastbrick.bat` in the Terminal panel, type `YES`, and don't touch anything until it reboots into TWRP.
- [ ] In TWRP: back up `boot`, `recovery` and `system` and copy them to `backups\<date>-checkers-stock\` on the PC.
- [ ] Compare `boot-root.img` with our stock boot, then flash it from hacked fastboot (`oem flags 61`, `flash boot`, `reboot`).
- [ ] Root shell over adb, `disable_bouncer`, install Kitchen Home, rename paladin, reboot.
- [ ] Wi-Fi back on only after TWRP is installed (TWRP blocks the patch from removing the unlock).
- [ ] Compact Kitchen Home layout for 960×480 with Hue scenes.

## Known problems on the last page

- **Endless "Sending payload… / USB Transferring" loop** is the common failure, and it leaves the device unchanged (still locked):
  - One user fixed it by moving from a Mac-hosted Windows VM to a real x86 machine.
  - One user fixed it by using `amonet-checkers-v1.1.6` after v2.0.1 kept looping, then flashed v2.0.1 in TWRP to update. The developer confirmed flashing the newer zip in TWRP is the right way to update.
  - The developer's advice for it: different USB ports and cables, USB 2.0.
  - One user on 6.5.7.4.1 could not get v2.0.2, v2.0.1 or v1.1.16 to work, and there was no answer yet.
- **A 2021 unit** (LK `5da77ac-20210918`) kept looping on 6.5.5.0. The developer still said it is vulnerable and not to update it.
- **Stuck at "USB Transferring" for 30+ minutes** after "Exploit most likely successful!": a power cycle left that device unchanged.

## After unlocking (post #2)

- **Rooted Fire OS:** in hacked fastboot (Volume Down while connecting power), run `fastboot oem flags 61`, then
  `fastboot flash boot boot-root.img`, then `fastboot reboot`. ADB is now on with a root shell.
- **Sideload:** `adb shell settings put global disable_bouncer 1`, then `adb install x.apk`.
- **Custom launcher:** rename `/system/priv-app/com.amazon.paladin/com.amazon.paladin.apk` to `.bak` (after `adb remount`) and reboot.

## Boot modes once unlocked

| Mode | How to enter |
|---|---|
| Hacked fastboot | Hold **Volume Down only** while connecting power |
| TWRP | Hold **Volume Up only** while connecting power |
| USBDL (unbrick via MTKClient) | Hold **Mute + Volume Down** while connecting power, with USB connected |

## Hard rules (from the thread)

- **Never** modify LK, Preloader, TEE/TZ or any other critical partition. Most units have no BROM recovery.
- Only flash stock firmware through TWRP.
- In USBDL mode, **never** flash TEE1, LK or Preloader.

## Plan for Kitchen Home on the Show 5

- Screen is 960×480 (the Show 8 is 1280×800), 1 GB RAM.
- Compact layout: big clock, weather, the next few calendar events, Hue **scene** buttons. No app tiles.
- Same calendar feeds (Bear Fam Google link, the phone relay on the Pi), re-entered in Settings on the device, never committed.
