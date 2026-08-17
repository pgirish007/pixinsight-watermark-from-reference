#engine v8

// author: Girish Pandit
// PixInsight PJSR script: reads acquisition metadata (telescope, camera,
// filter, exposure, capture date) from a reference image and overlays it
// as a text watermark onto a NEW copy of a target image, leaving the
// original untouched. The reference can be a FITS/XISF file on disk, or
// any view already loaded in the workspace - an original FITS light frame
// is recommended, since some values (gain, focal length) are only
// reliable straight from the camera's own header. Watermark position is
// set by dragging it in a live preview panel.
// Targets the V8 runtime introduced in PixInsight 1.9.4 (required on
// native Apple Silicon builds, which do not ship the legacy SpiderMonkey
// engine).

#feature-id    WatermarkFromReference : AstroByGirish > Watermark From Reference

#feature-info  Reads acquisition metadata from a reference image (file or \
   loaded view) and stamps it as a text watermark onto a new copy of a \
   target view, positioned by dragging in a live preview.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

const VERSION = "0.9";
const TITLE   = "Watermark From Reference";
const AUTHOR_NAME = "Girish Pandit";
const AUTHOR_LINK = "https://www.tiktok.com/@astrowithgirish";

function errorText( e )
{
   return ( e instanceof Error ) ? e.message : String( e );
}

function isNullView( view )
{
   return !view || view.isNull;
}

function isNullWindow( window )
{
   return !window || window.isNull;
}

// ---------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------

function extractMetadataFromWindow( w )
{
   let view = w.mainView;

   function prop( id )
   {
      try
      {
         let v = view.propertyValue( id );
         return ( v == null || v === "" ) ? null : v;
      }
      catch ( ex )
      {
         return null;
      }
   }

   function keyword( name )
   {
      for ( let i = 0; i < w.keywords.length; ++i )
         if ( w.keywords[i].name == name )
            return w.keywords[i].strippedValue.trim();
      return null;
   }

   function num( propId, keywordNames )
   {
      let v = prop( propId );
      if ( v != null )
      {
         v = parseFloat( v );
         return isNaN( v ) ? null : v;
      }
      for ( let i = 0; i < keywordNames.length; ++i )
      {
         let k = keyword( keywordNames[i] );
         if ( k != null )
         {
            let n = parseFloat( k );
            if ( !isNaN( n ) )
               return n;
         }
      }
      return null;
   }

   function numKeyword( keywordNames )
   {
      for ( let i = 0; i < keywordNames.length; ++i )
      {
         let k = keyword( keywordNames[i] );
         if ( k != null )
         {
            let n = parseFloat( k );
            if ( !isNaN( n ) )
               return n;
         }
      }
      return null;
   }

   // XISF standard Instrument properties express lengths in meters (SI
   // base unit), while the equivalent FITS keywords (FOCALLEN, APTDIA) are
   // conventionally in millimeters. Prefer the keyword - its unit is known
   // for certain - and only fall back to the property, scaled up, when no
   // keyword is present.
   function numLengthMm( propId, keywordNames )
   {
      let fromKeyword = numKeyword( keywordNames );
      if ( fromKeyword != null )
         return fromKeyword;
      let v = prop( propId );
      if ( v == null )
         return null;
      let n = parseFloat( v );
      return isNaN( n ) ? null : n * 1000; // meters -> millimeters
   }

   let telescope = prop( "Instrument:Telescope:Name" ) || keyword( "TELESCOP" ) || "Unknown telescope";
   let camera    = prop( "Instrument:Camera:Name" )    || keyword( "INSTRUME" ) || "Unknown camera";
   let mount     = keyword( "MOUNT" ) || null;
   let filter    = prop( "Instrument:Filter:Name" )    || keyword( "FILTER" )   || null;
   let object    = prop( "Observation:Object:Name" )   || keyword( "OBJECT" )   || null;

   let expSeconds = num( "Instrument:ExposureTime", [ "EXPTIME", "EXPOSURE" ] );

   let frameCount = null;
   let ncombine = keyword( "NCOMBINE" );
   if ( ncombine )
      frameCount = parseInt( ncombine, 10 );

   let dateObs = prop( "Observation:Time:Start" ) || keyword( "DATE-OBS" ) || null;

   let focalLength = numLengthMm( "Instrument:Telescope:FocalLength", [ "FOCALLEN" ] );
   // Deliberately keyword-only: the XISF "Camera:Gain" property records
   // electronic gain in e-/ADU, a different physical quantity from the
   // vendor-specific integer gain setting (e.g. ZWO/QHY "Gain" 0-600) that
   // GAIN/ISOSPEED record - mixing them would misreport the setting.
   let gain        = numKeyword( [ "GAIN", "ISOSPEED" ] );
   let temperature = num( "Instrument:Sensor:Temperature", [ "CCD-TEMP", "SET-TEMP" ] );
   let lat         = num( "Observation:Location:Latitude", [ "SITELAT" ] );
   let long        = num( "Observation:Location:Longitude", [ "SITELONG" ] );

   let raDeg  = num( "Observation:Center:RA", [] );
   let decDeg = num( "Observation:Center:Dec", [] );
   let raStr  = keyword( "OBJCTRA" ) || keyword( "RA" ) || null;
   let decStr = keyword( "OBJCTDEC" ) || keyword( "DEC" ) || null;

   return {
      telescope: telescope,
      camera: camera,
      mount: mount,
      filter: filter,
      object: object,
      expSeconds: expSeconds,
      frameCount: frameCount,
      dateObs: dateObs,
      focalLength: focalLength,
      gain: gain,
      temperature: temperature,
      lat: lat,
      long: long,
      raDeg: raDeg,
      decDeg: decDeg,
      raStr: raStr,
      decStr: decStr
   };
}

function readReferenceMetadataFromFile( filePath )
{
   let windows = ImageWindow.open( filePath );
   if ( windows.length == 0 )
      throw new Error( "Could not open reference file: " + filePath );

   try
   {
      return extractMetadataFromWindow( windows[0] );
   }
   finally
   {
      // XISF containers can carry more than one embedded image (e.g. a
      // master plus a rejection map) - close everything we opened, not
      // just the one we read metadata from.
      for ( let i = 0; i < windows.length; ++i )
         windows[i].forceClose();
   }
}

function formatExposure( meta )
{
   if ( meta.expSeconds == null || isNaN( meta.expSeconds ) )
      return null;

   let single = meta.expSeconds + "s";
   if ( meta.frameCount )
   {
      let totalSeconds = meta.expSeconds * meta.frameCount;
      let h = Math.floor( totalSeconds / 3600 );
      let m = Math.round( ( totalSeconds % 3600 ) / 60 );
      let totalStr = ( h > 0 ? h + "h " : "" ) + m + "m";
      return meta.frameCount + " x " + single + " (" + totalStr + ")";
   }
   return single;
}

function formatDate( dateObs )
{
   if ( !dateObs )
      return null;
   // XISF/FITS dates are typically ISO 8601, e.g. "2026-08-10T22:14:31"
   return String( dateObs ).split( "T" )[0];
}

function formatSexagesimal( deg, isRA )
{
   if ( deg == null || isNaN( deg ) )
      return null;
   let value = isRA ? deg / 15 : deg; // RA degrees -> hours
   let sign = value < 0 ? "-" : "";
   value = Math.abs( value );
   let hh = Math.floor( value );
   let mFull = ( value - hh ) * 60;
   let mm = Math.floor( mFull );
   let ss = Math.round( ( mFull - mm ) * 60 );
   if ( ss == 60 ) { ss = 0; mm += 1; }
   if ( mm == 60 ) { mm = 0; hh += 1; }
   let pad = ( n ) => ( n < 10 ? "0" : "" ) + n;
   return sign + pad( hh ) + ":" + pad( mm ) + ":" + pad( ss );
}

function formatCoordinates( meta )
{
   if ( meta.raStr || meta.decStr )
      return ( meta.raStr || "?" ) + "  " + ( meta.decStr || "?" );
   if ( meta.raDeg != null && meta.decDeg != null )
      return "RA " + formatSexagesimal( meta.raDeg, true ) + "  Dec " + formatSexagesimal( meta.decDeg, false );
   return null;
}

function formatLocation( meta )
{
   if ( meta.lat == null || meta.long == null )
      return null;
   if ( meta.locationName )
   {
      let n = meta.locationName;
      let parts = [ n.city, n.state, n.country ].filter( p => !!p );
      if ( parts.length )
         return parts.join( ", " );
   }
   return meta.lat.toFixed( 3 ) + "°, " + meta.long.toFixed( 3 ) + "°";
}

// In-session cache so re-previewing doesn't re-query the same coordinates.
// Keyed to 2 decimal places (~1km) - plenty of precision for a city/state
// lookup and it keeps repeated clicks free.
let locationNameCache = {};

// Reverse-geocodes lat/long to a city/state/country via OpenStreetMap's
// free, global, keyless Nominatim API. Best-effort only: any failure
// (offline, timeout, unexpected response) falls back to null so callers
// just keep showing raw coordinates instead of erroring out.
function reverseGeocodeLookup( lat, lon )
{
   let key = lat.toFixed( 2 ) + "," + lon.toFixed( 2 );
   if ( key in locationNameCache )
      return locationNameCache[key];

   let result = null;
   try
   {
      let url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
                 encodeURIComponent( lat ) + "&lon=" + encodeURIComponent( lon ) +
                 "&zoom=10&addressdetails=1";
      let xfer = new NetworkTransfer();
      xfer.setURL( url );
      // Nominatim's usage policy requires a descriptive User-Agent identifying
      // the application for any non-browser client.
      xfer.setCustomHTTPHeaders( [
         "User-Agent: WatermarkFromReference-PixInsightScript/" + VERSION +
         " (+https://github.com/pgirish007/pixinsight-watermark-from-reference)"
      ] );
      xfer.setConnectionTimeout( 6 );

      let received = new ByteArray;
      xfer.onDownloadDataAvailable = ( data ) =>
      {
         received.add( data );
         return true;
      };

      if ( xfer.download() && xfer.ok )
      {
         let json = JSON.parse( received.utf8ToString() );
         let addr = json.address || {};
         let city = addr.city || addr.town || addr.village || addr.municipality ||
                    addr.hamlet || addr.county || null;
         let state = addr.state || addr.region || addr.state_district || null;
         let country = addr.country || null;
         if ( city || state || country )
            result = { city: city, state: state, country: country };
      }
   }
   catch ( e )
   {
      result = null;
   }

   locationNameCache[key] = result;
   return result;
}

// Field registry driving the "Watermark fields" checkboxes in the dialog.
// id must be stable (used as the CheckBox lookup key); label is shown to
// the user; default controls whether it's checked the first time the
// dialog opens.
const FIELD_DEFS = [
   { id: "telescope",   label: "Telescope",       default: true  },
   { id: "camera",      label: "Camera",          default: true  },
   { id: "mount",       label: "Mount",           default: false },
   { id: "filter",      label: "Filter",          default: true  },
   { id: "object",      label: "Target / Object", default: false },
   { id: "exposure",    label: "Exposure",        default: true  },
   { id: "date",        label: "Date / Time",     default: true  },
   { id: "focalLength", label: "Focal Length",    default: false },
   { id: "coordinates", label: "Coordinates (RA/Dec)", default: false },
   { id: "gain",        label: "Gain",            default: false },
   { id: "temperature", label: "Sensor Temp",     default: false },
   { id: "location",    label: "Site Location",   default: false }
];

function formatField( id, meta )
{
   switch ( id )
   {
      case "telescope":   return meta.telescope || null;
      case "camera":      return meta.camera || null;
      case "mount":       return meta.mount || null;
      case "filter":      return meta.filter || null;
      case "object":      return meta.object || null;
      case "exposure":    return formatExposure( meta );
      case "date":        return formatDate( meta.dateObs );
      case "focalLength": return meta.focalLength ? Math.round( meta.focalLength ) + "mm" : null;
      case "coordinates": return formatCoordinates( meta );
      case "gain":        return meta.gain != null ? "Gain " + meta.gain : null;
      case "temperature": return meta.temperature != null ? meta.temperature.toFixed( 1 ) + "°C" : null;
      case "location":    return formatLocation( meta );
      default:            return null;
   }
}

// Builds display lines from whichever field ids the user selected, in
// FIELD_DEFS order, grouping a few fields per line so the watermark
// doesn't turn into one very long line when many fields are selected.
// If customText is given, it's appended as its own final line, exactly
// as typed - it isn't grouped in with the metadata fields.
function buildWatermarkLines( meta, selectedIds, customText )
{
   let parts = [];
   for ( let i = 0; i < FIELD_DEFS.length; ++i )
   {
      let def = FIELD_DEFS[i];
      if ( selectedIds.indexOf( def.id ) < 0 )
         continue;
      let v = formatField( def.id, meta );
      if ( v )
         parts.push( v );
   }

   let lines = [];
   const perLine = 3;
   for ( let i = 0; i < parts.length; i += perLine )
      lines.push( parts.slice( i, i + perLine ).join( "  |  " ) );

   if ( customText != null && customText.trim() != "" )
      lines.push( customText.trim() );

   return lines;
}

// ---------------------------------------------------------------------
// Layout - shared between the live preview panel and the final render,
// so the preview stays proportionally accurate at any panel size.
// posFracX/posFracY are 0..1 and locate the box's top-left corner between
// its leftmost/topmost and rightmost/bottommost allowed position (0,0 =
// top-left of the image, 1,1 = bottom-right, which is the default).
// ---------------------------------------------------------------------

function computeLayout( w, h, lines, posFracX, posFracY )
{
   let fontSize = Math.max( 6, Math.round( w * 0.014 ) );
   let margin   = Math.round( w * 0.015 );
   let lineGap  = Math.round( fontSize * 0.4 );
   let padding  = Math.round( fontSize * 0.6 );

   let font = new Font( FontFamily.SansSerif, fontSize );
   font.bold = true;

   let lineHeight = font.height;
   let ascent = font.ascent;
   let maxLineWidth = 0;
   for ( let i = 0; i < lines.length; ++i )
   {
      let lw = font.width( lines[i] );
      if ( lw > maxLineWidth )
         maxLineWidth = lw;
   }
   let blockHeight = lineHeight * lines.length + lineGap * ( lines.length - 1 );

   let boxW = maxLineWidth + padding * 2;
   let boxH = blockHeight + padding * 2;

   let minX = margin, maxX = Math.max( margin, w - margin - boxW );
   let minY = margin, maxY = Math.max( margin, h - margin - boxH );

   let boxX = Math.round( minX + posFracX * ( maxX - minX ) );
   let boxY = Math.round( minY + posFracY * ( maxY - minY ) );

   return {
      font: font, lineHeight: lineHeight, ascent: ascent, padding: padding, lineGap: lineGap,
      boxW: boxW, boxH: boxH, boxX: boxX, boxY: boxY,
      minX: minX, maxX: maxX, minY: minY, maxY: maxY
   };
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
// NOTE: the Bitmap/Graphics/PixelMath pipeline below has been tested and
// works on PixInsight 1.9.4 (V8 runtime). If a future run throws here,
// the error dialog now surfaces the real message - report it back.

function drawWatermark( targetWindow, lines, posFracX, posFracY )
{
   let image = targetWindow.mainView.image;
   let w = image.width;
   let h = image.height;

   let layout = computeLayout( w, h, lines, posFracX, posFracY );

   const boxOpacity  = 0.55;
   const boxGray     = 0x40;
   const boxMaskGray = Math.round( 255 * boxOpacity );

   // Renders one flat layer (opaque background + box + text) using solid
   // colors. Called twice below: once with the actual visual colors (the
   // "paint" layer) and once with the box/text drawn in shades of white
   // (the "mask" layer, used as a plain PixelMath opacity mask). This
   // avoids depending on the Bitmap's own alpha channel, which PixelMath
   // could not index reliably on this build.
   function renderLayer( boxColorARGB, textColorARGB )
   {
      let bmp = new Bitmap( w, h );
      bmp.fill( 0xff000000 ); // opaque black

      let g = new Graphics( bmp );
      g.antialiasing = true;
      g.font = layout.font;

      g.fillRect( layout.boxX, layout.boxY, layout.boxX + layout.boxW, layout.boxY + layout.boxH,
                  new Brush( boxColorARGB ) );

      g.pen = new Pen( textColorARGB );
      let y = layout.boxY + layout.padding;
      for ( let i = 0; i < lines.length; ++i )
      {
         g.drawText( layout.boxX + layout.padding, y + layout.ascent, lines[i] );
         y += layout.lineHeight + layout.lineGap;
      }

      g.end();
      return bmp.toImage();
   }

   function gray( level )
   {
      return 0xff000000 | ( level << 16 ) | ( level << 8 ) | level;
   }

   let colorImage = renderLayer( gray( boxGray ), 0xffffffff );
   let maskImage  = renderLayer( gray( boxMaskGray ), 0xffffffff );

   let colorWindow = new ImageWindow( w, h, 3, 32, true, true, "watermark_color" );
   colorWindow.mainView.beginProcess( UndoFlag.NoSwapFile );
   colorWindow.mainView.image.assign( colorImage );
   colorWindow.mainView.endProcess();

   let maskWindow = new ImageWindow( w, h, 3, 32, true, true, "watermark_mask" );
   maskWindow.mainView.beginProcess( UndoFlag.NoSwapFile );
   maskWindow.mainView.image.assign( maskImage );
   maskWindow.mainView.endProcess();

   let P = new PixelMath;
   P.expression = "watermark_color*watermark_mask + $T*(1 - watermark_mask)";
   P.useSingleExpression = true;
   P.createNewImage = false;
   P.rescale = false;
   P.truncate = true;

   // PixelMath manages its own view transaction inside executeOn() - do
   // not wrap it in a manual beginProcess()/endProcess(), that double-locks
   // the view.
   P.executeOn( targetWindow.mainView );

   colorWindow.forceClose();
   maskWindow.forceClose();
}

// ---------------------------------------------------------------------
// New-image output
// ---------------------------------------------------------------------

function uniqueId( base )
{
   let id = base;
   let n = 1;
   while ( !isNullWindow( ImageWindow.windowById( id ) ) )
      id = base + "_" + ( ++n );
   return id;
}

function duplicateWindow( sourceWindow, newId )
{
   let src = sourceWindow.mainView.image;
   let newWindow = new ImageWindow( src.width, src.height, 3, 32, true, true, newId );
   newWindow.mainView.beginProcess( UndoFlag.NoSwapFile );
   newWindow.mainView.image.assign( src );
   newWindow.mainView.endProcess();
   newWindow.keywords = sourceWindow.keywords;
   return newWindow;
}

// ---------------------------------------------------------------------
// Live preview panel - draws a placeholder frame at the target image's
// aspect ratio plus the real watermark box/text on top (via the same
// computeLayout() used for the final render), and lets the user drag the
// box to reposition it.
// ---------------------------------------------------------------------

class WatermarkPreview extends Control
{
   constructor( parent )
   {
      super( parent );

      this.setMinSize( 420, 300 );

      this.imageAspect = 1.5; // width / height, updated once a target is picked
      this.lines = [];
      this.posFracX = 1;
      this.posFracY = 1;
      this.backgroundBitmap = null; // real image thumbnail, when a target is selected

      this._boxRect = null;   // last drawn box rect, in control coordinates
      this._frame = null;     // last drawn placeholder-frame rect
      this._dragging = false;
      this._dragDX = 0;
      this._dragDY = 0;

      // Renders an actual thumbnail of the selected target image so the
      // preview shows what the watermark will look like on top of it. If
      // this fails for any reason, falls back to the plain placeholder
      // frame that was already in use before a target was rendered.
      this.setTargetView = ( view ) =>
      {
         if ( isNullView( view ) )
         {
            this.imageAspect = 1.5;
            this.backgroundBitmap = null;
            this.update();
            return;
         }

         let img = view.image;
         this.imageAspect = Math.max( 0.05, img.width / img.height );

         try
         {
            const maxThumbWidth = 480;
            let zoom = Math.min( 1, maxThumbWidth / img.width );
            this.backgroundBitmap = img.render( zoom, false, true );
         }
         catch ( e )
         {
            this.backgroundBitmap = null;
         }

         this.update();
      };

      this.previewFrameRect = () =>
      {
         let pad = 12;
         let availW = this.width - pad * 2;
         let availH = this.height - pad * 2;
         let fw = availW, fh = Math.round( availW / this.imageAspect );
         if ( fh > availH )
         {
            fh = availH;
            fw = Math.round( availH * this.imageAspect );
         }
         let fx = Math.round( ( this.width - fw ) / 2 );
         let fy = Math.round( ( this.height - fh ) / 2 );
         return { x: fx, y: fy, w: fw, h: fh };
      };

      this.onPaint = ( x0, y0, x1, y1 ) =>
      {
         let g = new Graphics( this );
         g.fillRect( 0, 0, this.width, this.height, new Brush( 0xff2b2b2b ) );

         let frame = this.previewFrameRect();
         this._frame = frame;

         if ( this.backgroundBitmap )
            g.drawScaledBitmap( frame.x, frame.y, frame.x + frame.w, frame.y + frame.h, this.backgroundBitmap );
         else
            g.fillRect( frame.x, frame.y, frame.x + frame.w, frame.y + frame.h, new Brush( 0xff141414 ) );

         g.pen = new Pen( 0xff707070 );
         g.drawRect( frame.x, frame.y, frame.x + frame.w, frame.y + frame.h );

         if ( this.lines.length > 0 && frame.w > 4 && frame.h > 4 )
         {
            let layout = computeLayout( frame.w, frame.h, this.lines, this.posFracX, this.posFracY );
            let bx = frame.x + layout.boxX;
            let by = frame.y + layout.boxY;

            g.fillRect( bx, by, bx + layout.boxW, by + layout.boxH, new Brush( 0xa0404040 ) );
            g.pen = new Pen( 0xff808080 );
            g.drawRect( bx, by, bx + layout.boxW, by + layout.boxH );

            g.pen = new Pen( 0xffffffff );
            g.font = layout.font;
            let y = by + layout.padding;
            for ( let i = 0; i < this.lines.length; ++i )
            {
               g.drawText( bx + layout.padding, y + layout.ascent, this.lines[i] );
               y += layout.lineHeight + layout.lineGap;
            }

            this._boxRect = { x: bx, y: by, w: layout.boxW, h: layout.boxH };
         }
         else
            this._boxRect = null;

         g.end();
      };

      this.onMousePress = ( x, y, button, buttonState, modifiers ) =>
      {
         let r = this._boxRect;
         if ( r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h )
         {
            this._dragging = true;
            this._dragDX = x - r.x;
            this._dragDY = y - r.y;
         }
      };

      this.onMouseMove = ( x, y, buttonState, modifiers ) =>
      {
         if ( !this._dragging || !this._frame || this.lines.length == 0 )
            return;

         let layout = computeLayout( this._frame.w, this._frame.h, this.lines, this.posFracX, this.posFracY );
         let localX = ( x - this._dragDX ) - this._frame.x;
         let localY = ( y - this._dragDY ) - this._frame.y;

         this.posFracX = layout.maxX > layout.minX ?
            Math.min( 1, Math.max( 0, ( localX - layout.minX ) / ( layout.maxX - layout.minX ) ) ) : 0;
         this.posFracY = layout.maxY > layout.minY ?
            Math.min( 1, Math.max( 0, ( localY - layout.minY ) / ( layout.maxY - layout.minY ) ) ) : 0;

         this.update();
      };

      this.onMouseRelease = ( x, y, button, buttonState, modifiers ) =>
      {
         this._dragging = false;
      };
   }
}

// ---------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------

class WatermarkDialog extends Dialog
{
   constructor()
   {
      super();

      let dlg = this;
      this.meta = null;

      this.windowTitle = TITLE + " v" + VERSION;

      this.aboutButton = new PushButton( this );
      this.aboutButton.text = "ℹ About";
      this.aboutButton.toolTip = "About this script";
      this.aboutButton.onClick = () =>
      {
         let text = TITLE + " v" + VERSION + "\n\n" +
            AUTHOR_NAME + "\n" +
            AUTHOR_LINK;
         (new MessageBox( text, "About " + TITLE, StdIcon.Information )).execute();
      };

      this.titleBarSizer = new HorizontalSizer;
      this.titleBarSizer.addStretch();
      this.titleBarSizer.add( this.aboutButton );

      this.helpLabel = new Label( this );
      this.helpLabel.frameStyle = FrameStyle.Box;
      this.helpLabel.minWidth = 45 * this.font.width( 'M' );
      this.helpLabel.wordWrapping = true;
      this.helpLabel.useRichText = true;
      this.helpLabel.text = "<p><b>" + TITLE + "</b> reads acquisition metadata " +
         "(telescope, camera, filter, exposure, date) from a reference image, " +
         "then stamps it as a text watermark onto a <b>new copy</b> of the target " +
         "view. Drag the box in the preview below to reposition it.</p>";

      // --- Target image -------------------------------------------------

      this.targetSectionLabel = new Label( this );
      this.targetSectionLabel.text = "Target image (to watermark):";

      this.targetViewList = new ViewList( this );
      this.targetViewList.getMainViews();
      this.targetViewList.onViewSelected = ( view ) =>
      {
         dlg.previewControl.setTargetView( view );
      };

      // --- Reference source -----------------------------------------------

      this.refSectionLabel = new Label( this );
      this.refSectionLabel.text = "Reference metadata source:";

      this.refSourceHintLabel = new Label( this );
      this.refSourceHintLabel.wordWrapping = true;
      this.refSourceHintLabel.useRichText = true;
      this.refSourceHintLabel.text = "<p style=\"color:#888;\">Prefer an original FITS light frame over a " +
         "stacked/processed XISF master - some acquisition values (e.g. gain, focal length) are only " +
         "reliable straight from the camera's own FITS header.</p>";

      this.refSourceViewRadio = new RadioButton( this );
      this.refSourceViewRadio.text = "From an open view";
      this.refSourceViewRadio.checked = true;

      this.refSourceFileRadio = new RadioButton( this );
      this.refSourceFileRadio.text = "From a FITS/XISF file";

      this.refSourceSizer = new HorizontalSizer;
      this.refSourceSizer.spacing = 12;
      this.refSourceSizer.add( this.refSourceViewRadio );
      this.refSourceSizer.add( this.refSourceFileRadio );
      this.refSourceSizer.addStretch();

      this.refViewList = new ViewList( this );
      this.refViewList.getMainViews();

      this.refFileEdit = new Edit( this );
      this.refFileEdit.readOnly = true;

      this.refFileButton = new PushButton( this );
      this.refFileButton.text = "Select Reference...";
      this.refFileButton.onClick = () =>
      {
         let ofd = new OpenFileDialog;
         ofd.caption = "Select Reference FITS or XISF File - an original light frame is recommended";
         ofd.filters = [
            [ "FITS Files", "*.fits", "*.fit", "*.fts" ],
            [ "XISF Files", "*.xisf" ]
         ];
         if ( ofd.execute() )
            dlg.refFileEdit.text = ofd.fileName;
      };

      this.refFileSizer = new HorizontalSizer;
      this.refFileSizer.spacing = 6;
      this.refFileSizer.add( this.refFileEdit, 100 );
      this.refFileSizer.add( this.refFileButton );

      let updateRefSourceVisibility = () =>
      {
         let useFile = dlg.refSourceFileRadio.checked;
         dlg.refViewList.visible = !useFile;
         dlg.refFileEdit.visible = useFile;
         dlg.refFileButton.visible = useFile;
      };
      this.refSourceViewRadio.onCheck = updateRefSourceVisibility;
      this.refSourceFileRadio.onCheck = updateRefSourceVisibility;
      updateRefSourceVisibility();

      // --- Watermark fields -------------------------------------------------

      this.fieldsSectionLabel = new Label( this );
      this.fieldsSectionLabel.text = "Watermark fields:";

      this.fieldCheckBoxes = {};
      let fieldsCol1 = new VerticalSizer;
      fieldsCol1.spacing = 3;
      let fieldsCol2 = new VerticalSizer;
      fieldsCol2.spacing = 3;

      for ( let i = 0; i < FIELD_DEFS.length; ++i )
      {
         let def = FIELD_DEFS[i];
         let cb = new CheckBox( this );
         cb.text = def.label;
         cb.checked = def.default;
         if ( def.id == "location" )
            cb.onCheck = ( checked ) =>
            {
               // Resolving a place name is meaningless without Site Location.
               if ( !checked )
                  dlg.resolveLocationCheckBox.checked = false;
               refreshPreview();
            };
         else
            cb.onCheck = () => refreshPreview();
         this.fieldCheckBoxes[def.id] = cb;
         ( i % 2 == 0 ? fieldsCol1 : fieldsCol2 ).add( cb );
      }

      this.fieldsSizer = new HorizontalSizer;
      this.fieldsSizer.spacing = 16;
      this.fieldsSizer.add( fieldsCol1 );
      this.fieldsSizer.add( fieldsCol2 );
      this.fieldsSizer.addStretch();

      this.resolveLocationCheckBox = new CheckBox( this );
      this.resolveLocationCheckBox.text = "Resolve Site Location to a city/state name (needs internet)";
      this.resolveLocationCheckBox.checked = false;
      this.resolveLocationCheckBox.toolTip =
         "Looks up the site coordinates via the free OpenStreetMap Nominatim " +
         "service and shows \"City, State, Country\" instead of raw coordinates. " +
         "Click Preview Metadata again after toggling this.";
      this.resolveLocationCheckBox.onCheck = ( checked ) =>
      {
         // Resolving needs Site Location itself checked too.
         if ( checked )
            dlg.fieldCheckBoxes["location"].checked = true;
         refreshPreview();
      };

      this.customTextLabel = new Label( this );
      this.customTextLabel.text = "Custom message (optional, shown as the last line):";

      this.customTextEdit = new Edit( this );
      this.customTextEdit.toolTip = "Free text, e.g. your name or website - added as its own line after the metadata fields.";
      this.customTextEdit.onTextUpdated = () => refreshPreview();

      // --- Preview --------------------------------------------------------

      let selectedFieldIds = () =>
      {
         let ids = [];
         for ( let i = 0; i < FIELD_DEFS.length; ++i )
            if ( dlg.fieldCheckBoxes[FIELD_DEFS[i].id].checked )
               ids.push( FIELD_DEFS[i].id );
         return ids;
      };

      let refreshPreview = () =>
      {
         if ( !dlg.meta )
            return;
         let lines = buildWatermarkLines( dlg.meta, selectedFieldIds(), dlg.customTextEdit.text );
         dlg.lines = lines;
         dlg.previewLabel.text = lines.length ? lines.join( "\n" ) : "(no fields selected)";
         dlg.previewControl.lines = lines;
         dlg.previewControl.update();
      };

      this.previewButton = new PushButton( this );
      this.previewButton.text = "Preview Metadata";
      this.previewButton.onClick = () =>
      {
         try
         {
            let meta;
            if ( dlg.refSourceFileRadio.checked )
            {
               if ( !dlg.refFileEdit.text )
               {
                  (new MessageBox( "Select a reference file first.", TITLE, StdIcon.Warning )).execute();
                  return;
               }
               meta = readReferenceMetadataFromFile( dlg.refFileEdit.text );
            }
            else
            {
               let view = dlg.refViewList.currentView;
               if ( isNullView( view ) )
               {
                  (new MessageBox( "Select a reference view first.", TITLE, StdIcon.Warning )).execute();
                  return;
               }
               meta = extractMetadataFromWindow( view.window );
            }
            if ( dlg.resolveLocationCheckBox.checked && meta.lat != null && meta.long != null )
            {
               dlg.previewButton.enabled = false;
               processEvents();
               meta.locationName = reverseGeocodeLookup( meta.lat, meta.long );
               dlg.previewButton.enabled = true;
            }
            dlg.meta = meta;
            refreshPreview();
         }
         catch ( e )
         {
            (new MessageBox( errorText( e ), TITLE, StdIcon.Error )).execute();
         }
      };

      this.previewLabel = new Label( this );
      this.previewLabel.frameStyle = FrameStyle.Box;
      this.previewLabel.minHeight = 40;
      this.previewLabel.wordWrapping = true;
      this.previewLabel.text = "";

      this.previewControl = new WatermarkPreview( this );
      this.previewControl.setTargetView( this.targetViewList.currentView );

      this.previewHintLabel = new Label( this );
      this.previewHintLabel.text = "Drag the box above to reposition the watermark.";

      // --- Apply / Cancel --------------------------------------------------

      this.applyButton = new PushButton( this );
      this.applyButton.text = "Add Watermark (new image)";
      this.applyButton.onClick = () =>
      {
         let targetView = dlg.targetViewList.currentView;
         if ( isNullView( targetView ) )
         {
            (new MessageBox( "Select a target image.", TITLE, StdIcon.Error )).execute();
            return;
         }
         if ( !dlg.meta )
         {
            (new MessageBox( "Click 'Preview Metadata' first.", TITLE, StdIcon.Warning )).execute();
            return;
         }
         if ( !dlg.lines || dlg.lines.length == 0 )
         {
            (new MessageBox( "Select at least one watermark field.", TITLE, StdIcon.Warning )).execute();
            return;
         }
         try
         {
            let newId = uniqueId( targetView.id + "_watermarked" );
            let newWindow = duplicateWindow( targetView.window, newId );
            try
            {
               drawWatermark( newWindow, dlg.lines,
                               dlg.previewControl.posFracX, dlg.previewControl.posFracY );
            }
            catch ( e )
            {
               newWindow.forceClose();
               throw e;
            }
            newWindow.show();
            dlg.ok();
         }
         catch ( e )
         {
            (new MessageBox( errorText( e ), TITLE, StdIcon.Error )).execute();
         }
      };

      this.cancelButton = new PushButton( this );
      this.cancelButton.text = "Cancel";
      this.cancelButton.onClick = () => { dlg.cancel(); };

      this.buttonSizer = new HorizontalSizer;
      this.buttonSizer.spacing = 6;
      this.buttonSizer.addStretch();
      this.buttonSizer.add( this.applyButton );
      this.buttonSizer.add( this.cancelButton );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 6;
      this.sizer.add( this.titleBarSizer );
      this.sizer.add( this.helpLabel );
      this.sizer.add( this.targetSectionLabel );
      this.sizer.add( this.targetViewList );
      this.sizer.addSpacing( 6 );
      this.sizer.add( this.refSectionLabel );
      this.sizer.add( this.refSourceHintLabel );
      this.sizer.add( this.refSourceSizer );
      this.sizer.add( this.refViewList );
      this.sizer.add( this.refFileSizer );
      this.sizer.addSpacing( 6 );
      this.sizer.add( this.fieldsSectionLabel );
      this.sizer.add( this.fieldsSizer );
      this.sizer.add( this.resolveLocationCheckBox );
      this.sizer.addSpacing( 6 );
      this.sizer.add( this.customTextLabel );
      this.sizer.add( this.customTextEdit );
      this.sizer.addSpacing( 6 );
      this.sizer.add( this.previewButton );
      this.sizer.add( this.previewLabel );
      this.sizer.add( this.previewControl );
      this.sizer.add( this.previewHintLabel );
      this.sizer.addSpacing( 6 );
      this.sizer.add( this.buttonSizer );
   }
}

function main()
{
   let dlg = new WatermarkDialog;
   dlg.execute();
}

main();
