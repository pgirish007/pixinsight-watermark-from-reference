# Watermark From Reference

A PixInsight (PJSR/V8 runtime, PixInsight 1.9.4+) script that reads
acquisition metadata (telescope, camera, filter, exposure, date, and more)
from a reference FITS/XISF file or an open view, and stamps it as a text
watermark onto a **new copy** of a target image. The watermark position is
set by dragging it in a live preview panel.

Requires PixInsight 1.9.4 or later (V8 script runtime).

## Installing (as a PixInsight update repository)

1. In PixInsight: **RESOURCES → Updates → Manage Repositories → Add**
2. Paste this URL:
   ```
   https://raw.githubusercontent.com/pgirish007/pixinsight-watermark-from-reference/main/updates/
   ```
3. **RESOURCES → Updates → Check for Updates**, then apply the update and
   restart PixInsight.
4. The script appears under **SCRIPT → AstroByGirish → Watermark From Reference**.

## Installing manually (without a repository)

Copy `WatermarkFromReference.js` anywhere, then in PixInsight use
**SCRIPT → Execute Script File...** and select it, or drop it into your
PixInsight `scripts/` folder and use the Script Editor's Feature Manager to
install it under the Scripts menu permanently.

## Usage

1. Pick a **target image** (the view to watermark) from the loaded views.
2. Pick a **reference metadata source** - either an already-open view, or
   browse to a FITS/XISF file. Prefer an original FITS light frame over a
   stacked/processed XISF master: some values (gain, focal length) are only
   reliable straight from the camera's own FITS header.
3. Check which **watermark fields** to include.
4. Click **Preview Metadata**, drag the watermark box in the preview to
   position it.
5. Click **Add Watermark (new image)** - creates a new image window with
   the watermark baked in; the original target is left untouched.

## Releasing a new version (maintainer)

1. Edit `WatermarkFromReference.js`, bump the `VERSION` constant.
2. Run `python3 tools/build.py` - zips the script and regenerates
   `updates/updates.xri` (keeps all previous releases in the index).
3. Commit and push `WatermarkFromReference.js`, `updates/updates.xri`, and
   the new `updates/WatermarkFromReference-<date>.zip`.
4. Users pick it up automatically next time they check for updates.
