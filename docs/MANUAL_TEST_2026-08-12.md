# What to test by hand — `fix/feedback-2026-08-12`

Six defects were fixed. Each one below names the exact thing to do, what you should see, and what the
failure looked like before, so a partial fix cannot pass as a whole one.

Automated coverage already holds the logic: shared 461, mobile 3129, desktop pro sync 573, renderer 204.
None of it can prove a real transfer between two machines, which is what this list is for.

**Setup once:** Mac desktop and Windows desktop both running, Android and iPhone both paired, all four on
the same network. Install the new mobile build on the phones and a fresh desktop build on both machines.

---

## 1. A received file can be opened — the one to test first

Two reports were one defect, so both directions must pass.

1. On the **phone**, send a file manually to **Windows**. Wait for the transfer to complete.
2. On Windows, open Activity and find that row.

- **Expect:** the row offers the file — a preview and a working Open.
- **Before:** "This activity no longer has a local file", while the bytes were on disk.

3. On the **phone**, attach an image to a chat message. Open that chat on the **Mac**.

- **Expect:** the image opens.
- **Before:** "the file has moved".

**The case that actually broke it:** a device that has re-registered since the transfer. If you can, unpair
and re-pair a phone, then open an activity row from *before* the re-pair. That is the condition the fix
targets — the record names the peer as it was, the row asks for the peer as it is now.

## 2. Generated media arrives on the phone

1. On the **desktop**, generate an image.
2. Watch the **Android** phone.

- **Expect:** it arrives with no extra switch touched. Generated media is on by default now.
- **Before:** attachments arrived and generated media did not.

3. Then go to the phone's receiving settings and turn **Files** off. Generate another image.

- **Expect:** it still arrives. "Files" means files sent to you directly, and it no longer governs
  generated media.
- **Before:** one switch silently governed both.

4. Turn **Generated media** off. Generate one more.

- **Expect:** now it is refused, and the sender reports it as refused rather than silently dropping it.

Repeat 1 and 2 for a **message attachment** from desktop, which has its own switch for the same reason.

## 3. A cancelled pairing lets you try again

1. On the **phone**, start pairing with a desktop and deliberately type a **wrong** code.
2. When it fails, press **Cancel**.
3. Immediately start pairing again with the same device, this time with the right code.

- **Expect:** the sheet is gone after Cancel, and the retry shows its own progress and pairs.
- **Before:** the sheet still said "pairing…" over the retry, and only restarting the app cleared it.

Also confirm the useful half survived: type a wrong code and do **not** cancel.

- **Expect:** it still tells you the codes did not match. Only your own cancel is withheld.

## 4. A fresh phone can find the desktop

This is the one that needs the awkward setup, and it is worth it — it silenced the desktop completely.

1. On the **Mac**, plug in a **dock or USB-Ethernet adapter with no DHCP** — anything that lands on a
   `169.254.x` self-assigned address. `ifconfig` should show it active with that address.
2. From another machine: `dns-sd -B _offgrid._tcp local`

- **Expect:** the Mac's record is listed.
- **Before:** nothing from the Mac appeared, while its own setting still read discoverable. The log said
  `Bonjour discovery unavailable: send EHOSTUNREACH 224.0.0.251:5353`.

3. On a phone with **no pairing to that Mac**, open Devices and scan.

- **Expect:** the Mac appears and can be paired.
- **Before:** invisible. An already-paired phone kept working, which is what hid this.

4. Now move the Mac between networks — switch Wi-Fi, or pull the cable and use Wi-Fi.

- **Expect:** within a few seconds the Mac is discoverable again at its new address, with no restart.
- **This is new behaviour.** Desktop never followed its own address before, so it is the most likely place
  for a regression. Please try it twice.

## 5. A generated image previews on Windows

1. On **Windows**, generate an image.

- **Expect:** the preview renders in the chat.
- **Before:** the preview was broken; only Download produced a working file.

2. Generate one whose prompt makes a long filename, and one while the app is at a different window size.

- **Expect:** both preview. The old failure was in the path, not the picture, so a path with a space in it
  is the interesting case — the profile directory "Off Grid AI Desktop" already contains two.

3. Then confirm sync: that image should reach the phone (this is also test 2).

## 6. Nothing regressed on macOS previews

The preview fix touched a path shared by every locally served image.

1. On the **Mac**, open Replay, a generated image, and a style-picker thumbnail.

- **Expect:** all render as before. macOS never had the Windows fault, so this is purely a no-regression
  check on the same code.

---

## Not fixed, so do not test for a fix

Recorded in `FEEDBACK_2026-08-12.md` with the reason each one waits:

- **A reinstall costs a mesh seat** (Pat). Needs a device identity that survives reinstall — a product
  decision, and acting without one would evict a device someone still uses.
- **"LLM is busy" on a text-to-voice switch** (Pat). Cause found: the send is refused after a 15-second
  wait while this codebase documents a 74-second prefill. The fix should wait on progress rather than
  elapsed time, and wants a device round of its own.
- **Muse Glimmer 30B will not load.** Confirmed: the architecture is absent from the llama.cpp that
  llama.rn 0.12.9 bundles. Needs the dependency moved, not a setting changed.
- **The persona text opening a reply.** The route is real — `systemPrompt` is a synced setting and that
  sentence exists only in mobile — but the evidence was overwritten before it could be read. If you see it
  again, run the query in the feedback doc **before** changing any setting.
- **The web-search result reading as the answer.** Did not reproduce; that chip renders collapsed. A
  screenshot of the turn would settle it.
