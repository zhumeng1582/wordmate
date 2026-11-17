Wordmate share-poster background assets

Ten original AI-generated, text-free landscape backgrounds. All are portrait PNGs
at approximately 941 x 1672 pixels and were composed with calm text areas for
poster copy and progress figures.

01-lake.png             Misty alpine lake
02-ocean-sunrise.png     Sunrise coastline
03-cloud-sky.png         Open sky and cloud sea
04-desert.png            Desert dunes
05-deep-sea.png          Sunlit underwater scene
06-forest-path.png       Woodland path
07-mountain-valley.png   Climbing trail through a valley
08-snow-mountain.png     Snow peaks and frozen lake
09-river-canyon.png      River canyon
10-island-bay.png        Turquoise island bay

These original PNGs are kept outside the miniapp package because together they
are about 24 MB. Compressed derivatives live under compressed/ and are uploaded
to private OSS, not bundled in the miniapp. Ten WebP files at quality 65 total
1,166,570 bytes; ten JPEG compatibility files total 3,338,341 bytes. Original
pixel dimensions are preserved. No image subpackages remain in the miniapp.
Rebuild with `node scripts/build-share-posters.cjs` on macOS (cwebp and sips).
Upload with the target environment loaded using scripts/upload-share-posters.cjs;
it verifies checksums and does not overwrite differing existing objects.
The source PNGs remain unchanged. The API also uses them for local generation.

The poster canvas now draws at 1800 x 2400 and exports PNG at that same size.
Text and the invitation code are drawn at three times the 600 x 800 layout
coordinates, rather than enlarging an already rasterized small canvas.
The authenticated /api/checkin-backgrounds/:id/:format route reads only the ten
allowlisted private OSS objects under OSS_POSTER_PREFIX/compressed-v1/. It uses
the existing API download domain and keeps credentials out of the miniapp.
The miniapp downloads a temporary local image before drawing. iOS uses JPEG;
other platforms prefer WebP and fall back to JPEG on decoding failures. Each
page retains at most three temporary backgrounds and clears them when its owner
changes or the page is destroyed. Failed downloads can be retried; account/child
changes invalidate pending preparation. No paid image generation is involved.
