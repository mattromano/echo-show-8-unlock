# amonet-crown-v2.0.2 package review

Reviewed 2026-11-04 by unpacking and reading the package without running anything.

## The file

| | |
|---|---|
| File | `amonet-crown-v2.0.2.zip`, 42 MB, from the attachments on XDA post #1 |
| SHA256 | `45DD602D5ACE0CBF477B3A955F4E74BDF471FB792476AD482B7640FEE250742A` |
| Defender | `Trojan:Script/Wacatac.H!ml`, an ML/heuristic verdict rather than a signature match |
| Source compared against | `R0rt1z2/amonet` branch `mt8163-echo-show`, commit `d6179b8` (2026-08-15) |

## Layout

There are 33 files, exactly what `makedist.sh` in the source repo builds, and nothing extra.
`device.prop` says `DEVICE=crown`, `DEVICE_TYPE_ID=A1Z88NGR2BK6A2`.

## Scripts compared with the source

| File | Result |
|---|---|
| `fastbrick.bat`, `profile.ps1`, `profile.sh`, `boot-*.sh`, `bootrom-step.sh`, `fastboot-step.sh` | Identical |
| `modules/gpt.py`, `handshake*.py`, `load_payload.py`, `logger.py` | Identical |
| `META-INF/.../update-binary`, `updater-script` | Identical |
| `fastbrick.ps1`, `fastbrick.sh` | **+ a `Check-Patched` safeguard.** It exits without touching the device if the LK build date is 2026 or later, which covers the patched 6575.1 firmware. Ours is `20240709`, so the check passes. Harmless. |
| `modules/common.py`, `modules/main.py` | Older block-at-a-time eMMC writer. The GitHub head has since added multi-block writes. These are only used by the Linux bootrom (Option 2) path, not the Windows fastbrick path. Harmless. |

**What `fastbrick.bat` / `fastbrick.ps1` do on the PC:** they run `bin\fastboot.exe` against the connected device
(`getvar product`, `unlock_status` and `lk_build_desc`), ask for `YES`, then loop on `fastboot flash brick bin\fastbrick.img`.
There are no downloads, registry writes, startup entries, services, or file writes on the PC.
`-ExecutionPolicy Bypass`, plus a script repeatedly spawning an exe, is the likely trigger for Defender's ML detection.

## Binaries

| File | Finding |
|---|---|
| `bin/fastboot.exe` | Google's Authenticode signature, now in **HashMismatch** status: a Google-built fastboot that has been modified. This matches the thread's credit to alextrack2013 "for patching the Windows fastboot binaries". The only embedded URLs are DigiCert certificate links and developer.android.com. Its imports (WS2_32, SHELL32) are normal for fastboot, which supports TCP. **This is the main remaining trust point. It can't be rebuilt from source.** |
| `bin/AdbWinApi.dll`, `AdbWinUsbApi.dll` | Validly signed by Google (Android SDK 2.0.0.x) |
| `bin/fastbrick.img`, `twrp.img`, `lk.bin`, `preloader.img`, `tz.img`, `tee-payload.bin`, `crown-kaeru.bin`, `brom-payload/*.bin` | Device-side payloads, which get sent to the Echo and are never run on the PC. Not in the source repo (built artifacts). |
| `bin/fastboot`, `bin/fastboot32` | Linux ELF builds, unused on Windows |

## Verdict

The PC-side behaviour matches the published source, apart from the two harmless differences above. Nothing in the package
reaches the network or persists on Windows. The remaining trust is in the developer's modified `fastboot.exe`
and the device payloads. That's the same trust everyone else in the thread places in them, and the device-side risk is
what the guide already warns about.
