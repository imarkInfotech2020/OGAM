# What to test by hand — `release/sync-feedback`

Six defects were fixed, one is withdrawn (section 3), and the mobile inference runtime moved — which is the
riskiest thing in here and has its own section. Each one below names the exact thing to do, what you should see, and what the
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

## 3. Copy in another app on Android, paste on the desktop

The headline fix from your list, and the one that needs a permission you have never granted before.

1. Install the new build. Open **Sync settings** and turn **Clipboard sync** ON.

- **Expect:** a sheet appears saying Android hides the clipboard from apps that are not on screen, with a
  button to open Accessibility settings.
- **Expect:** nothing asked for this at launch — only when you switched the feature on.

2. Tap the button, and turn **Off Grid AI** on in the Accessibility list.

- Read that screen's description while you are there. It says what is read and what is not, and it is what
  a user decides on.

3. Come back to the app. Open **Chrome**, select some text, copy it.

- **Expect:** it reaches the desktop clipboard.
- **Before:** nothing outside the Off Grid app was ever captured — the phone had never sent one clipboard
  entry, in either build.

4. Copy something **inside** the Off Grid app.

- **Expect:** still works. That path already worked and must not have regressed.

5. Now turn the Accessibility service **off** in Android settings, return, and toggle Clipboard sync off
   and on again.

- **Expect:** the sheet appears again, because the grant is genuinely missing. It is not a one-time
  explainer.

6. Copy an image or a file in another app.

- **Expect:** nothing syncs. Clipboard sync is text-only by design, so this is a check that it fails
  quietly rather than doing something surprising.

**The honest limit:** capture rides on a text selection. A long-press "Copy" with no highlight may still
come back empty. If you find a copy that does not travel, tell me whether you had text selected.

## 4. Pairing — NOT FIXED, but worth reproducing precisely

I had this wrong and the test suite caught me. My first fix hid a cancelled attempt, and
`deviceManagement.integration.test.tsx` disproved the premise: that journey cancels, reads "Pairing
cancelled", retries and pairs, so retry-after-cancel already worked and the confirmation is wanted. I
reverted the behaviour change and kept only a genuine robustness fix — an attempt is now read at its LAST
state, so it can never be presented from an earlier row of its own history.

**So do not test for a fix here. Test to pin down the sequence**, because the working journey and your
report disagree, and the difference is the bug:

1. Start pairing, type a **wrong** code, let it fail.
2. Press **Cancel** on the failed attempt.
3. Start pairing again with the correct code.

Tell me exactly what the sheet says at each step, and whether the retry pairs. My suspicion is that a
cancel does nothing to an attempt that has already reached `failed` — a terminal attempt has nothing left
to cancel — so it stays on screen as the last thing that happened. The journey that passes cancels while
still `waiting_for_confirmation`, which is a different state and a different code path.

A screen recording of those three steps would settle it in one pass.

## 5. A fresh phone can find the desktop

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

## 6. A generated image previews on Windows

1. On **Windows**, generate an image.

- **Expect:** the preview renders in the chat.
- **Before:** the preview was broken; only Download produced a working file.

2. Generate one whose prompt makes a long filename, and one while the app is at a different window size.

- **Expect:** both preview. The old failure was in the path, not the picture, so a path with a space in it
  is the interesting case — the profile directory "Off Grid AI Desktop" already contains two.

3. Then confirm sync: that image should reach the phone (this is also test 2).

## 7. Nothing regressed on macOS previews

The preview fix touched a path shared by every locally served image.

1. On the **Mac**, open Replay, a generated image, and a style-picker thumbnail.

- **Expect:** all render as before. macOS never had the Windows fault, so this is purely a no-regression
  check on the same code.

## 8. The mobile inference runtime moved — the riskiest change here

`llama.rn` went from 0.12.9 to 0.13.0-rc.0. It is a release candidate, and it changed the TTS API.

1. Load a text model you use often and send a few messages.

- **Expect:** loads and streams as before. Try one on the Hexagon/NPU backend too, since those kernels come
  from this runtime — they are byte-identical to what we shipped, but worth one pass.

2. **Speak a reply with OuteTTS.** This is the one I would test first.

- **Expect:** speech sounds as it did.
- **Why:** 0.13 removed the guide-token API OuteTTS used and moved that job into native. I adapted the
  engine, but guide tokens are what kept the spoken output tied to the text, so a regression would show as
  drifting or wrong words rather than an error.

3. Try **Nemotron 3.5** — new in this runtime, and it should now load where it could not before.

4. Voice mode: switch text → voice mid-conversation.

- **Expect:** it may still say "LLM is busy". That is Pat's open defect, not this bump. Note if it got
  worse.

---

## Not fixed, so do not test for a fix

Recorded in `FEEDBACK_2026-08-12.md` with the reason each one waits:

- **A reinstall costs a mesh seat** (Pat). Needs a device identity that survives reinstall — a product
  decision, and acting without one would evict a device someone still uses.
- **"LLM is busy" on a text-to-voice switch** (Pat). Cause found: the send is refused after a 15-second
  wait while this codebase documents a 74-second prefill. The fix should wait on progress rather than
  elapsed time, and wants a device round of its own.
- **Muse Glimmer 30B on Android.** Still absent from llama.rn 0.13.0-rc.0. Upstream PR #379 carries it and
  is open; we check again immediately before the release. It IS testable on **desktop**, which moved to
  llama.cpp b10369 — and by Meta's own numbers it is a desktop model anyway: under 20 GB at 4-bit, needing
  a 24-32 GB envelope.
- **The persona text opening a reply.** The route is real — `systemPrompt` is a synced setting and that
  sentence exists only in mobile — but the evidence was overwritten before it could be read. If you see it
  again, run the query in the feedback doc **before** changing any setting.
- **The web-search result reading as the answer.** Did not reproduce; that chip renders collapsed. A
  screenshot of the turn would settle it.
