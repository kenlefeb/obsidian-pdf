# PDF Wrapper spike checklist

> **Note (added when the spike was removed).** The spike commands were removed
> from the plugin after commit `f2a3fc6`. Spike 1 was run by the owner (see the
> design spec). Spike 2 was never run. It can still be run by building commit
> `f2a3fc6`. The rest of this file is unchanged.

This is a test build, not a release. It answers two questions before the rest
of the plugin is built:

- **Spike 1:** does hiding PDF rows in the file explorer still work when there
  are hundreds or thousands of them?
- **Spike 2:** can the plugin tell a change you made in Obsidian on this
  device apart from a change made in Finder or delivered by sync?

You do not need to judge the answers. Follow the steps, tick each box, write
what you saw in the notes, and send back the log files (see "Sending the
results"). Where a step says "write down the time", the hour and minute is
enough.

The build adds six commands. Open the command palette (on the Mac press
`Cmd+P`; on the phone, swipe down on a note or tap the command button in the
toolbar) and type `spike` to find them. Each shows as
`PDF Wrapper: Spike: …`:

| Command | What it does |
|---|---|
| Spike: toggle event log | Switches the log on or off on this device. A message says which, and names the log file. |
| Spike: create dummy pairs | Asks for a number, then creates that many pairs `Doc 1.md` + `Doc 1.pdf`, `Doc 2.md` + `Doc 2.pdf`, … in a folder `_pdf-wrapper-spike` at the vault root. The PDFs are empty files. Pairs that already exist are kept. |
| Spike: toggle hiding of dummy PDF files | Hides the dummy PDFs in the file explorer and adds a small "PDF" label after each dummy note. Run it again to show them. It stays on after a restart until you switch it off. |
| Spike: remove dummy pairs | Deletes the whole `_pdf-wrapper-spike` folder. |
| Spike: rename a test pair | Lists the notes in the `Spike test` folder that have a PDF of the same name next to them. Pick one, and it renames the note and then its PDF straight away, to `… renamed`, the way the finished plugin will. Works only while the event log is on. |
| Spike: snapshot test files | Writes into the log a list of every file in the `Spike test` folder, with its size and time, as Obsidian sees it and as the disk shows it. Works whether or not the event log is on. |

## Before you start

The spike creates, renames and deletes files. **Do not run it in your real
vaults.** Use test vaults:

- [ ] **iCloud test vault.** In Obsidian on the Mac, open the vault switcher
  ("Open another vault"), choose "Create new vault", name it
  `Spike iCloud`, and save it in the Obsidian folder in iCloud Drive. Open
  the same vault on the phone.
  Notes: ____
- [ ] **Obsidian Sync test vault.** Create a second new vault, `Spike Sync`,
  stored locally on the Mac (not in iCloud). Settings → Sync → connect it to a
  new remote vault. On the phone, create a vault and connect it to the same
  remote vault. In Settings → Sync → "Vault configuration sync", on both
  devices, switch on "Installed community plugins" and "Active community
  plugin list".
  Notes: ____

If you cannot create a second remote vault in Obsidian Sync, use a copy of a
real vault instead, never the real one. Write down what you used:

- [ ] Vaults used: ____

Also check, in each test vault, Settings → Files and links → "Deleted files".
Whatever it says is where this build's deletes go.

- [ ] Deleted files setting: ____
- [ ] Obsidian version on the Mac (Settings → General, "Current version", and
  the "Installer version" shown there): ____
- [ ] Obsidian version on the phone (Settings → General): ____

## Installing the build

You were given three files: `main.js`, `manifest.json`, `styles.css`.

On the Mac, for **each** test vault:

- [ ] In Finder, open the vault folder. The `.obsidian` folder is hidden;
  press `Cmd+Shift+.` (full stop) to show hidden files.
- [ ] Inside `.obsidian`, open `plugins` (create it if it is missing), and
  create a folder named exactly `pdf-wrapper`. Copy the three files into it,
  so you have `<vault>/.obsidian/plugins/pdf-wrapper/main.js` and the other
  two next to it. If they are already there from an earlier build, replace
  them.
- [ ] If there is also a folder `.obsidian/plugins/wrap-pdf` (an older name of
  this plugin), turn that plugin off in Obsidian first.
- [ ] Quit Obsidian (`Cmd+Q`) and open it again on this vault.
- [ ] Settings → Community plugins. If "Restricted mode" is on, turn it off.
  Under "Installed plugins", turn on **PDF Wrapper**.
  Notes: ____

On the phone, for **each** test vault:

- [ ] The `pdf-wrapper` folder has to reach the phone. In the iCloud vault,
  iCloud copies it over by itself; wait until the Mac shows the files as
  uploaded. In the Sync vault, Obsidian Sync copies it if you switched on the
  two "Vault configuration sync" options above.
- [ ] Close Obsidian on the phone completely (swipe it away in the app
  switcher) and open it again on the vault.
- [ ] Settings → Community plugins. Turn off "Restricted mode" if it is on.
  Check that **PDF Wrapper** is listed under "Installed plugins" and switched
  on. If it is listed but off, switch it on. If it is not listed, wait a few
  minutes for sync and restart Obsidian again.
- [ ] Open the command palette and type `spike`. All six commands should
  appear. If they do not, the phone does not have this build yet.
  Notes: ____

## Spike 1: hiding rows in the file explorer

Do this in **one** test vault (the Sync vault is fine), with the event log
**off** on both devices (it is off unless you switched it on). The dummy files
sync to the other device; that is expected.

### On the Mac

- [ ] Run "Spike: create dummy pairs", enter `300`, choose Create. Wait for
  "Done".
- [ ] Run "Spike: toggle hiding of dummy PDF files". The message should say
  "Hiding 300 dummy PDF files".
- [ ] In the file explorer, open the `_pdf-wrapper-spike` folder. You should see
  only notes named `Doc …`, each with a faint "PDF" after its name, and no
  PDF files.
- [ ] Scroll slowly to the bottom of the folder, then quickly back to the top
  and down again. Look for: empty gaps between rows, rows that are missing or
  appear twice, PDFs that show up, rows that jump, scrolling that stutters or
  lags.
  Result (300, Mac): ☐ looks right ☐ problems. Notes: ____
- [ ] Quit Obsidian (`Cmd+Q`) and open it again. Hiding switches itself back
  on. Repeat the scroll test.
  Result (300, Mac, after restart): ☐ looks right ☐ problems. Notes: ____
- [ ] Run "Spike: create dummy pairs" again and enter `3000`. The existing 300
  are kept and 2700 are added. This can take a few minutes. Wait for "Done".
- [ ] Run "Spike: toggle hiding of dummy PDF files" twice (off, then on). The
  message should say "Hiding 3000 dummy PDF files". Repeat the scroll test.
  Result (3000, Mac): ☐ looks right ☐ problems. Notes: ____
- [ ] Quit and reopen Obsidian. Repeat the scroll test.
  Result (3000, Mac, after restart): ☐ looks right ☐ problems. Notes: ____

### On the phone

Wait until all of the Mac's dummy files have synced to the phone (the
`_pdf-wrapper-spike` folder on the phone holds as many `Doc …` notes as on
the Mac). Do not create dummy pairs on the phone.

- [ ] With 300 pairs (if the 3000 have already arrived, use 3000 and skip the
  300 rows): run "Spike: toggle hiding of dummy PDF files", open the file
  explorer, open `_pdf-wrapper-spike`, and do the same scroll test.
  Result (300, phone): ☐ looks right ☐ problems. Notes: ____
- [ ] Close Obsidian completely and reopen it. Repeat the scroll test.
  Result (300, phone, after restart): ☐ looks right ☐ problems. Notes: ____
- [ ] With 3000 pairs: run the hiding command twice (off, then on), check the
  message says 3000, and do the scroll test.
  Result (3000, phone): ☐ looks right ☐ problems. Notes: ____
- [ ] Close Obsidian completely and reopen it. Repeat the scroll test.
  Result (3000, phone, after restart): ☐ looks right ☐ problems. Notes: ____

### Clean up after spike 1

- [ ] On the Mac, run "Spike: remove dummy pairs". Wait until the
  `_pdf-wrapper-spike` folder is gone on the phone too.
- [ ] On each device, run "Spike: toggle hiding of dummy PDF files" until it
  says the dummy PDF files are shown.
- [ ] How many PDFs do your real vaults hold, roughly? ____

## Spike 2: telling local changes from outside changes

Do this section twice: once in `Spike iCloud`, once in `Spike Sync`. Keep
both devices open on the same vault the whole time.

### Set up (each vault)

Arrival times only count if both devices are awake and Obsidian is running
on them. For the whole of spike 2:

- [ ] On the phone, Settings → Display & Brightness → Auto-Lock → **Never**.
  Keep Obsidian open in the foreground on the phone the whole time, with the
  phone on a charger. (You will set Auto-Lock back at the end.)
  Auto-Lock was: ____
- [ ] On the Mac, keep Obsidian open and stop the Mac from sleeping (for
  example, plug it in and in System Settings → Displays / Lock Screen set the
  display to stay on for the length of the test).
- [ ] Both devices set their clock automatically. On the phone: Settings →
  General → Date & Time → "Set Automatically" is on. On the Mac: System
  Settings → General → Date & Time → "Set time and date automatically" is on.
- [ ] Make sure the dummy pairs from spike 1 are gone from this vault.
- [ ] Find two or three small real PDFs (for example, on the Mac, File →
  Print → PDF → Save as PDF from any web page).
- [ ] On the Mac, in Obsidian, create a folder named exactly `Spike test` at the vault root, with:
  - notes `A.md`, `B.md`, and PDFs `A.pdf`, `B.pdf` (drag the PDFs into the
    folder in Obsidian);
  - a subfolder `Folder 1` holding `C.md` and `C.pdf`;
  - an empty folder `Other`.
- [ ] Wait until all of it has reached the phone.
- [ ] On the Mac, run "Spike: toggle event log". It should say the log is on.
- [ ] On the phone, run "Spike: toggle event log". It should say the log is on.
- [ ] A file named `pdf-wrapper-spike-log-desktop-….md` and one named
  `pdf-wrapper-spike-log-mobile-….md` appear at the vault root (each may take
  a minute to show on the other device). Do not open or edit them while
  testing.

For every action below: write down the time, then **wait at least one
minute** before the next action, and note on the other device whether and how
the change arrived.

### In Obsidian on the Mac

- [ ] Rename note `A.md` to `A renamed` (right-click → Rename).
  Time: ____ Seen on phone: ____
- [ ] Rename PDF `A.pdf` to `A renamed.pdf`.
  Time: ____ Seen on phone: ____
- [ ] Rename a note and its PDF together: run "Spike: rename a test pair" and
  pick `Spike test/B.md`. Both become `B renamed`. On the phone, watch for the
  note and the PDF to change, and write down when each did.
  Time: ____ Note seen on phone: ____ PDF seen on phone: ____
- [ ] Move note `B renamed.md` into `Other` (drag it in the file explorer).
  Time: ____ Seen on phone: ____
- [ ] Move PDF `B renamed.pdf` into `Other`.
  Time: ____ Seen on phone: ____
- [ ] Move the folder `Folder 1` into `Other`.
  Time: ____ Seen on phone: ____
- [ ] Delete note `A renamed.md` (right-click → Delete).
  Time: ____ Seen on phone: ____
- [ ] Delete PDF `A renamed.pdf`.
  Time: ____ Seen on phone: ____

### In Obsidian on the phone

First, on the Mac in Obsidian, add a fresh `D.md` and `D.pdf`, and a fresh
`G.md` and `G.pdf`, to `Spike test`, and wait until they reach the phone. Then, on the phone (long-press a file or
folder in the file explorer for Rename, Move and Delete):

- [ ] Rename note `D.md` to `D renamed`.
  Time: ____ Seen on Mac: ____
- [ ] Rename PDF `D.pdf` to `D renamed.pdf`.
  Time: ____ Seen on Mac: ____
- [ ] Rename a note and its PDF together: run "Spike: rename a test pair" and
  pick `Spike test/G.md`. Both become `G renamed`. On the Mac, write down when
  the note and the PDF each changed.
  Time: ____ Note seen on Mac: ____ PDF seen on Mac: ____
- [ ] Move note `D renamed.md` into `Other`.
  Time: ____ Seen on Mac: ____
- [ ] Move PDF `D renamed.pdf` into `Other`.
  Time: ____ Seen on Mac: ____
- [ ] Move the folder `Other/Folder 1` back into `Spike test`.
  Time: ____ Seen on Mac: ____
- [ ] Delete note `Other/D renamed.md`.
  Time: ____ Seen on Mac: ____
- [ ] Delete PDF `Other/D renamed.pdf`.
  Time: ____ Seen on Mac: ____

### In Finder on the Mac (Obsidian stays open on both devices)

First, in Obsidian, add `E.md` and `E.pdf`, and `H.md` and `H.pdf`, to
`Spike test`. Then, in Finder, in the vault folder:

- [ ] Rename `E.md` to `E renamed.md`.
  Time: ____ Seen on phone: ____
- [ ] Rename `E.pdf` to `E renamed.pdf`.
  Time: ____ Seen on phone: ____
- [ ] Rename a note and its PDF together, **without waiting in between**:
  rename `H.md` to `H renamed.md`, then straight away (within a few seconds)
  rename `H.pdf` to `H renamed.pdf`.
  Time: ____ Note seen on phone: ____ PDF seen on phone: ____
- [ ] Move `E renamed.md` into `Other`.
  Time: ____ Seen on phone: ____
- [ ] Move `E renamed.pdf` into `Other`.
  Time: ____ Seen on phone: ____
- [ ] Move the folder `Spike test/Folder 1` into `Other`.
  Time: ____ Seen on phone: ____
- [ ] Move `Other/E renamed.md` to the Bin.
  Time: ____ Seen on phone: ____
- [ ] Move `Other/E renamed.pdf` to the Bin.
  Time: ____ Seen on phone: ____

### Adding a new PDF, by each route you use

Do each route you actually use; skip the others. Write down the time the PDF
was added and when it showed on the other device.

- [ ] Mac: drag a PDF from Finder into the Obsidian window (onto `Spike test`
  in the file explorer).
  Time: ____ Seen on phone: ____
- [ ] Mac: save a PDF straight into the `Spike test` folder from another app
  (for example, Print → Save as PDF, or a download).
  Time: ____ Seen on phone: ____
- [ ] Phone: add a PDF from the share sheet (Share → Obsidian) or however you
  normally do it there. Route: ____
  Time: ____ Seen on Mac: ____
- [ ] Phone: scan a document into the vault, if you do that. Route: ____
  Time: ____ Seen on Mac: ____
- [ ] Any other route you use. Route: ____
  Time: ____ Seen on other device: ____
- [ ] Note for a new PDF: on the Mac, add one more PDF `F.pdf` to `Spike test`
  in Obsidian, and straight away create a note `F.md` next to it. Write down
  when each appears on the phone.
  Time added: ____ PDF seen on phone: ____ Note seen on phone: ____

### PDFs not yet downloaded (iCloud vault only)

Removing a download does not rename, move or delete anything, so the log only
sees it through "Spike: snapshot test files". Run the snapshot exactly where
the steps say.

- [ ] On the Mac, run "Spike: snapshot test files". Time: ____
- [ ] In Finder, right-click one PDF in `Spike test` (for example `C.pdf`
  wherever it is now) and choose "Remove Download". Which PDF: ____
  Time: ____
- [ ] Wait a minute, then on the Mac run "Spike: snapshot test files" again,
  **before** opening anything. Time: ____
- [ ] Open that PDF in Obsidian on the Mac. What happened: ____
- [ ] Run "Spike: snapshot test files" once more. Time: ____
- [ ] Now the phone. On the Mac, drag one more PDF (a large one if you have
  it, several MB) into `Spike test` in Obsidian. As soon as it shows on the
  phone, run "Spike: snapshot test files" on the phone, then again every 15
  seconds or so, three or four times, then once more after it opens properly.
  Times: ____
- [ ] On the phone, did the new PDF look empty or fail to open before it had
  fully downloaded? Notes: ____

### Finish this vault

- [ ] Wait two minutes so the last changes sync, then run "Spike: toggle event
  log" on both devices. It should say the log is off.
- [ ] Set the phone's Auto-Lock back to what it was, and let the Mac sleep
  normally again.
- [ ] Anything else you noticed: ____

## Sending the results

From **each** test vault, send back every file whose name starts with
`pdf-wrapper-spike-log-` (they are at the vault root; each device writes its
own). Put them in two folders named `iCloud` and `Sync` so it is clear which
vault each came from, and send this checklist with your ticks and notes.

## When you are finished

- [ ] Logs are off on every device in every test vault (toggle once more if
  unsure; the message says on or off).
- [ ] No `_pdf-wrapper-spike` folder is left (run "Spike: remove dummy pairs"
  if one is).
- [ ] Turn PDF Wrapper off in Settings → Community plugins in the test vaults.
  Do not install this build in a real vault.

## What the logs must answer

You do not need to work these out; they are listed so you know what the test
is for.

1. Is every in-app rename, move or delete, on the Mac and on the phone, logged
   as `local=true`? (Adding a file is never marked, so creates always show
   `local=false`.)
2. Is any change made in Finder, or delivered by sync, logged as `local=true`
   (Obsidian Sync especially)?
3. Does a rename made on one device arrive on the other as a rename or as a
   delete followed by a create, and how far apart do the note and the PDF
   arrive?
4. How long after a new PDF appears does a note created for it on the first
   device reach the second?

The spec also asks what a not-yet-downloaded iCloud PDF looks like to the
plugin. The log can show only part of that: the snapshot lines record, before
and after "Remove Download" and while a PDF arrives on the phone, the size and
time Obsidian holds for each file and what the disk lists (including hidden
iCloud placeholder files, if the disk listing shows them), and the log records
any change of a PDF's size that Obsidian reports. Whether the PDF opened, and
what it looked like, comes from your notes in that section.

## Results

### Spike 1 (explorer hiding), recorded 2026-11-15

- Mac, Obsidian 1.15.1, iCloud test vault: hiding works with 300 and with
  3,000 dummy pairs; the owner scrolled to the end with every PDF hidden.
- Hiding switched on while the 3,000 pairs were still being created covered
  only the pairs that existed at that moment (about 950) until creation
  finished and the rules were rebuilt. Consequence for the plugin: rules must
  be rebuilt as pairs change, including during a bulk wrap.
- The same 6,000 rules on 3,000 simulated rows in Chromium 153: all parsed,
  all PDF rows hidden.
- Not yet checked: behaviour after restarting Obsidian; the phone.
- Decision: "Hide paired PDFs" stays on by default.

### Spike 2 (local versus outside changes)

Not yet run. Setup is in place in the iCloud test vault (test folder, event
log, rename command working). Tasks 7 onward wait on these logs.
