No official logo file was provided for this build (only a photo of a
business card). The site currently uses a CSS/SVG "bh" hexagon badge
(see .bh-logo-badge in static/css/custom.css) that approximates the
business card's black/white/red palette.

To use the real logo:
1. Drop the logo image file in this folder (e.g. logo.png or logo.svg).
2. Update the .bh-logo-badge usages in templates/base.html and
   templates/admin/admin_base.html to reference it, e.g.:
   <img src="{{ url_for('static', filename='img/logo/logo.png') }}" alt="Benas Hub" height="38">
