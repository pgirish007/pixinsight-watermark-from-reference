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
  install and run fine. To remove that notice, use PixInsight's
  `CodeSign` script with a CPD identity to sign `updates.xri`.
