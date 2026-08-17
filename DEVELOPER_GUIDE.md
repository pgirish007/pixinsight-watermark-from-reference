# Developer Guide

## Project layout

```
WatermarkFromReference.js     the script - single source of truth, edit this
WatermarkFromReference.xsgn   optional - script signature from CodeSign (committed if present)
tools/build.py                packages the script into update-repository format
updates/updates.xri           generated repository index (committed)
updates/*.zip                  generated, one zip per release (committed, kept as history)
README.md                     user-facing install/usage guide
```

`tools/build.py` reads `WatermarkFromReference.js` directly from the repo
root - there's no separate `src/` working copy to keep in sync. It zips the
script into PixInsight's install-relative path
(`src/scripts/AstroByGirish/WatermarkFromReference.js`) only inside the
generated zip under `updates/`. If `WatermarkFromReference.xsgn` exists at
the repo root (see "Signing the repository" below), it's automatically
bundled into the zip alongside the script, at
`src/scripts/AstroByGirish/WatermarkFromReference.xsgn`. Unlike the
`.xssk` keys file, `.xsgn` is a public signature - safe and expected to be
committed.

## Releasing a new version

1. Edit `WatermarkFromReference.js`, bump the `VERSION` constant.
2. *(If you're signing releases - see below)* re-run `CodeSign` on
   `WatermarkFromReference.js` now, since it changed, so
   `WatermarkFromReference.xsgn` matches the new content.
3. Run:
   ```
   python3 tools/build.py
   ```
   This zips the script (plus `WatermarkFromReference.xsgn` if present)
   and regenerates `updates/updates.xri`, keeping every previous release's
   `<package>` entry in the index (so PixInsight's update history/rollback
   keeps working).
4. *(If you're signing releases)* sign `updates/updates.xri` with
   `CodeSign` now - it must be signed **after** step 3 regenerates it, or
   the signature won't match.
5. Commit and push `WatermarkFromReference.js`, `WatermarkFromReference.xsgn`
   (if present), `updates/updates.xri`, and the new
   `updates/WatermarkFromReference-<date>.zip`.
6. Users pick up the new version automatically next time they check for
   updates (**RESOURCES → Updates → Check for Updates**).

## Repository format notes

- `updates.xri` is the index PixInsight's update checker reads; it's just a
  URL PixInsight polls (`RESOURCES → Updates → Manage Repositories`), no
  special hosting is required beyond serving static files over HTTPS - this
  repo uses raw.githubusercontent.com.
- The menu location (`SCRIPT → AstroByGirish → Watermark From Reference`)
  is controlled by the `#feature-id` line at the top of
  `WatermarkFromReference.js`, not by the zip's internal folder name -
  keep `CATEGORY` in `build.py` matching it for consistency, but changing
  one without the other won't break anything on its own.
- The full `#feature-id` syntax is `#feature-id <script-id> : <menu-item>`
  - the `<script-id>` part (currently `WatermarkFromReference`) is a
  stable, unique identifier with **no spaces**, separate from the
  menu path after the colon. **Don't drop the `<script-id> :` prefix** -
  without it the file has no identifier CodeSign can attach a signature
  to, which is exactly the `Security.generateScriptSignatureFile(): No
  script identifier has been specified` error this project hit before
  the directive was corrected to include it.
- Code signing is optional. Unsigned packages show
  `Signature: <* unavailable *>` in PixInsight's update dialog but still
  install and run fine. See "Signing the repository" below to remove that
  notice.

## Signing the repository

**Do not sign `updates/updates.xri` (or ship a locally-signed `.xsgn`)
until a real CPD identity exists.** This was tried and it broke the live
repository for everyone: PixInsight checks a repository's `<Signature>`
against its CPD database only, so a *local* signing identity (not yet a
CPD) is simply not in there, and PixInsight hard-fails with `Unknown code
signing identity 'AstroByGirish'` instead of falling back to the
"unsigned" warning - unlike an actually-unsigned repository, which just
shows `Signature: <* unavailable *>` and still works fine. An unsigned
repository is strictly safer than one signed with an identity PixInsight
can't verify. Local signing identities are only meant for verifying
*your own* scripts on *your own* licensed machine (see step 2 below) -
not for anything shipped to other users, including the repository index
and the script's `.xsgn`.

So: leave the repository unsigned (current state) until step 4 below
(CPD approval) is complete, then resume signing `updates.xri` and
`WatermarkFromReference.xsgn` on every release.

This is a manual, multi-step process done from inside PixInsight - it
can't be scripted from this repo, and the last step (CPD approval) is an
external application to PixInsight that isn't in our control. All of this
is documented in PixInsight's own
[Script Code Signing reference](https://pixinsight.com/doc/docs/ScriptCodeSigning/ScriptCodeSigning.html) -
these are the parts relevant to this repo. The three tools below
(`SigningKeys`, `CodeSign`, `SubmitCPD`) are standard PixInsight scripts -
if their exact submenu isn't obvious in your version, use
**Process Explorer** (or the Script menu's search) and type the name.

1. **Generate a signing key pair.** Run the standard `SigningKeys` script,
   *Generate Signing Keys* option. This creates a private keys file
   (`.xssk` extension) protected by a password you choose - the same kind
   of file works for a local identity or a future CPD submission.
   - **Never commit the `.xssk` file to git or share it.** Whoever holds
     it (and its password) can sign packages as you. Keep it outside this
     repo. `.gitignore` in this repo already excludes `*.xssk` as a
     safety net.
2. **(Optional, for testing only - don't ship this) Register it as your
   local signing identity.** **Script → Local Signing Identity...** →
   point it at your `.xssk` file and password, check *Make the local
   signing identity persistent*. This lets `CodeSign` produce signatures
   immediately so you can rehearse the workflow, but as explained above,
   these signatures aren't recognized off your own machine - fine to
   practice with on a scratch copy, but don't commit/push the result as
   the real release's `updates.xri` or `.xsgn` until step 4 is done.
3. **Get CPD-approved (step 4 below), then sign for real with
   `CodeSign`.** Once your public key is in PixInsight's CPD database,
   run `CodeSign` and give it:
   - the file(s) to sign: `WatermarkFromReference.js` **and**
     `updates/updates.xri` (only executable `.js` files with a valid
     `#feature-id`/`#script-id`, and `.xri` files, can be signed -
     `.jsh`/include files should not be)
   - your `.xssk` keys file and its password
   - *Entitlements*: leave empty - this script doesn't need any
   - Sign `updates.xri` **after** `tools/build.py` regenerates it for a
     release; signing an older copy invalidates the signature. Signing
     `WatermarkFromReference.js` produces a companion `.xsgn` file that
     must ship alongside the script inside the zip's
     `src/scripts/AstroByGirish/` folder - `tools/build.py` bundles it in
     automatically if `WatermarkFromReference.xsgn` exists at the repo
     root when you run it.
4. **Apply for a CPD identity (do this first, before step 3):**
   apply to become a **Certified PixInsight Developer (CPD)** by running
   the standard `SubmitCPD` script. It sends your public key (read from
   the `.xssk` file), a chosen developer identifier, and a contact email
   to PixInsight for review. Once approved, your public key ships in
   PixInsight's own CPD database update, and from then on your signatures
   verify as trusted on every user's installation, not just yours. This
   step is entirely outside this repo's or my control - it's a manual
   review by the PixInsight team.
