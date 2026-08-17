# Developer Guide

## Project layout

```
WatermarkFromReference.js   the script - single source of truth, edit this
tools/build.py              packages the script into update-repository format
updates/updates.xri         generated repository index (committed)
updates/*.zip                generated, one zip per release (committed, kept as history)
README.md                   user-facing install/usage guide
```

`tools/build.py` reads `WatermarkFromReference.js` directly from the repo
root - there's no separate `src/` working copy to keep in sync. It zips the
script into PixInsight's install-relative path
(`src/scripts/AstroByGirish/WatermarkFromReference.js`) only inside the
generated zip under `updates/`.

## Releasing a new version

1. Edit `WatermarkFromReference.js`, bump the `VERSION` constant.
2. Run:
   ```
   python3 tools/build.py
   ```
   This zips the script and regenerates `updates/updates.xri`, keeping
   every previous release's `<package>` entry in the index (so PixInsight's
   update history/rollback keeps working).
3. Commit and push `WatermarkFromReference.js`, `updates/updates.xri`, and
   the new `updates/WatermarkFromReference-<date>.zip`.
4. Users pick up the new version automatically next time they check for
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
- Code signing is optional. Unsigned packages show
  `Signature: <* unavailable *>` in PixInsight's update dialog but still
  install and run fine. See "Signing the repository" below to remove that
  notice.

## Signing the repository

This removes the `Signature: <* unavailable *>` line, but it's a manual,
multi-step process done from inside PixInsight - it can't be scripted from
this repo, and the last step is an external application to PixInsight
that isn't in our control. Do this only if you want it; the script works
fine unsigned.

1. **Generate a signing key pair.** In PixInsight, run the standard
   `SigningKeys` script (**SCRIPT → Development → SigningKeys**, exact
   menu path may vary slightly by version). This creates a private keys
   file (`.xssk`) protected by a password you choose.
   - **Never commit the `.xssk` file to git or share it.** Whoever holds
     it can sign packages as you. Keep it outside this repo (e.g. in your
     PixInsight config folder or a password manager), and make sure
     `.gitignore` would catch it if it ever ended up here.
2. **Sign `updates/updates.xri` after every build.** Run PixInsight's
   `CodeSign` script (**SCRIPT → Development → CodeSign**) and point it at
   `updates/updates.xri` and your `.xssk` file. This must happen *after*
   `tools/build.py` regenerates `updates.xri` for a release - signing
   an older copy invalidates the signature.
   - Optionally sign `WatermarkFromReference.js` itself the same way; this
     produces a companion `.xsgn` file that would need to ship alongside
     the script inside the zip.
3. **What this buys you right away:** a *locally trusted* signature -
   PixInsight on your own machine will show it as signed. Other users
   installing the repository will still see it as signed by an
   unverified/local identity, not a globally trusted one.
4. **To get a trusted badge for every user (optional, external, slow):**
   apply to become a **Certified PixInsight Developer (CPD)** by running
   the standard `SubmitCPD` script and submitting your public signing key
   and developer identifier to the PixInsight team for review. This is a
   manual application process outside this repo and PixInsight's control,
   not something that can be automated here - see
   [pixinsight.com's Script Code Signing docs](https://pixinsight.com/doc/docs/ScriptCodeSigning/ScriptCodeSigning.html)
   for current details.
