# Watermark From Reference

A PixInsight (PJSR/V8 runtime, PixInsight 1.9.4+) script that reads
acquisition metadata (telescope, camera, filter, exposure, date, and more)
from a reference FITS/XISF file or an open view, and stamps it as a text
watermark onto a **new copy** of a target image. The watermark position is
set by dragging it in a live preview panel.

Requires PixInsight 1.9.4 or later (V8 script runtime).

## Features

- Reads telescope, camera, mount, filter, target/object, exposure, date,
  focal length, coordinates, gain, sensor temperature and site location
  straight from FITS keywords or XISF properties
- Pick exactly which fields appear in the watermark
- Live preview with drag-to-reposition placement
- Non-destructive: always creates a new image, the original is never modified
- Reference metadata can come from an already-open view or a file on disk

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

1. Open **SCRIPT → AstroByGirish → Watermark From Reference**.
2. Under **Target image**, pick the view you want watermarked from the list
   of loaded views.
3. Under **Reference metadata source**, choose either:
   - **From an open view** - any image already loaded in PixInsight, or
   - **From a FITS/XISF file** - browse to a file on disk.

   Prefer an original FITS light frame over a stacked/processed XISF
   master: some values (gain, focal length) are only reliable straight from
   the camera's own FITS header.
4. Under **Watermark fields**, check whichever fields you want included
   (see the full list below). Telescope, Camera, Filter, Exposure and
   Date/Time are checked by default. If you check **Site Location**, you
   can also check **Resolve Site Location to a city/state name** to show
   "City, State, Country" instead of raw coordinates - this looks the
   coordinates up via the free, keyless [OpenStreetMap Nominatim](https://nominatim.org/)
   service, so it needs an internet connection and sends the rounded
   coordinates to openstreetmap.org. Leave it unchecked to keep everything
   offline.
5. Click **Preview Metadata**. The live preview shows a thumbnail of your
   target image with the watermark rendered on top - drag the box to
   reposition it anywhere on the image.
6. Click **Add Watermark (new image)**. A new image window is created with
   the watermark baked in; your original target image is left untouched.

Click the **ℹ About** button at any time for the script's version and author
info.

## Available watermark fields

| Field | Shows |
|---|---|
| Telescope | Telescope/OTA name |
| Camera | Camera/sensor name |
| Mount | Mount name (if recorded by your capture software) |
| Filter | Filter name |
| Target / Object | Target/object name |
| Exposure | Single sub exposure, frame count, and total integration time |
| Date / Time | Capture date |
| Focal Length | Telescope focal length, in mm |
| Coordinates (RA/Dec) | Target right ascension / declination |
| Gain | Camera gain setting |
| Sensor Temp | Sensor temperature at capture |
| Site Location | Observation site latitude/longitude, or city/state/country if "Resolve Site Location to a city/state name" is checked |

A field only appears in the watermark if the selected reference actually
contains that data - missing values are skipped rather than shown as blank.

## Developer guide

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for the project layout and how
to build and publish a new release.

## Author

Girish Pandit - [@astrowithgirish on TikTok](https://www.tiktok.com/@astrowithgirish)
