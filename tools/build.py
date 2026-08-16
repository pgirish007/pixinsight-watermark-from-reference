#!/usr/bin/env python3
# Builds the WatermarkFromReference PixInsight update repository: zips the
# script into PixInsight's install-relative src/scripts/ layout and
# regenerates updates/updates.xri so PixInsight's own update checker can
# find and install it.
#
# Usage: python3 tools/build.py

import hashlib
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_SRC = ROOT / "WatermarkFromReference.js"
UPDATES_DIR = ROOT / "updates"

CATEGORY = "AstroByGirish"      # must match the #feature-id category
SCRIPT_NAME = "WatermarkFromReference"
TITLE = "Watermark From Reference"
PLATFORM_VERSION = "1.9.0:2.99.99"
DESCRIPTION = (
    "Stamps acquisition metadata (telescope, camera, filter, exposure, "
    "date and more) from a reference FITS/XISF file or an open view as a "
    "text watermark onto a new copy of a target image, positioned by "
    "dragging in a live preview."
)


def read_version():
    text = SCRIPT_SRC.read_text()
    m = re.search(r'const VERSION\s*=\s*"([^"]+)"', text)
    if not m:
        sys.exit("Could not find VERSION constant in " + str(SCRIPT_SRC))
    return m.group(1)


def build_zip(release_date):
    zip_name = f"{SCRIPT_NAME}-{release_date}.zip"
    zip_path = UPDATES_DIR / zip_name
    arcname = f"src/scripts/{CATEGORY}/{SCRIPT_NAME}.js"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(SCRIPT_SRC, arcname)
    return zip_path


def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def write_updates_xri():
    packages = []
    for zip_path in sorted(UPDATES_DIR.glob(f"{SCRIPT_NAME}-*.zip")):
        m = re.match(rf"{SCRIPT_NAME}-(\d{{8}})\.zip", zip_path.name)
        if not m:
            continue
        release_date = m.group(1)
        digest = sha1_of(zip_path)
        packages.append(
            f'      <package fileName="{zip_path.name}" sha1="{digest}" '
            f'type="script" releaseDate="{release_date}">\n'
            f'         <title>{escape(TITLE)}</title>\n'
            f'         <description>\n'
            f'            <p>{escape(DESCRIPTION)}</p>\n'
            f'         </description>\n'
            f'      </package>'
        )

    xri = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<xri version="1.0">\n'
        '   <description>\n'
        f'      <p>{escape(TITLE)} - PixInsight script update repository.</p>\n'
        '   </description>\n'
        f'   <platform os="all" arch="noarch" version="{PLATFORM_VERSION}">\n'
        + "\n".join(packages) + "\n"
        '   </platform>\n'
        '</xri>\n'
    )
    (UPDATES_DIR / "updates.xri").write_text(xri)


def main():
    UPDATES_DIR.mkdir(exist_ok=True)
    version = read_version()
    release_date = date.today().strftime("%Y%m%d")
    zip_path = build_zip(release_date)
    write_updates_xri()
    print(f"Built {zip_path.name} (v{version}) and regenerated updates.xri")


if __name__ == "__main__":
    main()
