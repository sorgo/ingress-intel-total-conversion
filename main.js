// ==UserScript==
// @id             ingress-intel-total-conversion@breunigs
// @name           intel map total conversion
// @version        0.6-@@BUILDDATE@@
// @namespace      https://github.com/breunigs/ingress-intel-total-conversion
// @updateURL      https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/dist/total-conversion-build.user.js
// @downloadURL    https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/dist/total-conversion-build.user.js
// @description    total conversion for the ingress intel map.
// @include        http://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// ==/UserScript==


// REPLACE ORIG SITE ///////////////////////////////////////////////////
if(document.getElementsByTagName('html')[0].getAttribute('itemscope') != null)
  throw('Ingress Intel Website is down, not a userscript issue.');

// disable vanilla JS
window.onload = function() {};

// rescue user data from original page
var scr = document.getElementsByTagName('script');
for(var x in scr) {
  var s = scr[x];
  if(s.src) continue;
  if(s.type !== 'text/javascript') continue;
  var d = s.innerHTML.split('\n');
  break;
}


if(!d) {
  // page doesn’t have a script tag with player information.
  if(document.getElementById('header_email')) {
    // however, we are logged in.
    setTimeout('location.reload();', 10*1000);
    throw('Page doesn’t have player data, but you are logged in. Reloading in 10s.');
  }
  // FIXME: handle nia takedown in progress
  throw('Couldn’t retrieve player data. Are you logged in?');
}


for(var i = 0; i < d.length; i++) {
  if(!d[i].match('var PLAYER = ')) continue;
  eval(d[i].match(/^var /, 'window.'));
  break;
}
// player information is now available in a hash like this:
// window.PLAYER = {"ap": "123", "energy": 123, "available_invites": 123, "nickname": "somenick", "team": "ALIENS||RESISTANCE"};

var ir = window.internalResources || [];

// remove complete page. We only wanted the user-data and the page’s
// security context so we can access the API easily. Setup as much as
// possible without requiring scripts.
document.getElementsByTagName('head')[0].innerHTML = ''
  //~ + '<link rel="stylesheet" type="text/css" href="http://0.0.0.0:8000/style.css"/>'
  + '<title>Ingress Intel Map</title>'
  + (ir.indexOf('mainstyle') === -1
      ? '<link rel="stylesheet" type="text/css" href="http://breunigs.github.com/ingress-intel-total-conversion/style.css?@@BUILDDATE@@"/>'
      : '')
  + (ir.indexOf('leafletcss') === -1
      ? '<link rel="stylesheet" type="text/css" href="http://cdn.leafletjs.com/leaflet-0.5/leaflet.css"/>'
      : '')
  + (ir.indexOf('codafont') === -1
      ? '<link rel="stylesheet" type="text/css" href="http://fonts.googleapis.com/css?family=Coda"/>'
      : '');

document.getElementsByTagName('body')[0].innerHTML = ''
  + '<div id="map">Loading, please wait</div>'
  + '<div id="chatcontrols" style="display:none">'
  + '  <a><span class="toggle expand"></span></a>'
  +   '<a>full</a><a>compact</a><a>public</a><a class="active">faction</a>'
  + '</div>'
  + '<div id="chat" style="display:none">'
  + '  <div id="chatfaction"></div>'
  + '  <div id="chatpublic"></div>'
  + '  <div id="chatcompact"></div>'
  + '  <div id="chatfull"></div>'
  + '</div>'
  + '<form id="chatinput" style="display:none"><time></time><span>tell faction:</span><input type="text"/></form>'
  + '<a id="sidebartoggle"><span class="toggle close"></span></a>'
  + '<div id="scrollwrapper">' // enable scrolling for small screens
  + '  <div id="sidebar" style="display: none">'
  + '    <div id="playerstat">t</div>'
  + '    <div id="gamestat">&nbsp;loading global control stats</div>'
  + '    <input id="geosearch" placeholder="Search location…" type="text"/>'
  + '    <div id="portaldetails"></div>'
  + '    <input id="redeem" placeholder="Redeem code…" type="text"/>'
  + '    <div id="toolbox">'
  + '      <a onmouseover="setPermaLink(this)">permalink</a>'
  + '      <a href="https://github.com/breunigs/ingress-intel-total-conversion#readme" title="IITC = Ingress Intel Total Conversion.\n\nOn the script’s homepage you can:\n– find updates\n– get plugins\n– report bugs\n– and contribute." style="cursor: help">IITC’s page</a></div>'
  + '  </div>'
  + '</div>'
  + '<div id="updatestatus"></div>';

// putting everything in a wrapper function that in turn is placed in a
// script tag on the website allows us to execute in the site’s context
// instead of in the Greasemonkey/Extension/etc. context.
function wrapper() {

// LEAFLET PREFER CANVAS ///////////////////////////////////////////////
// Set to true if Leaflet should draw things using Canvas instead of SVG
// Disabled for now because it has several bugs: flickering, constant
// CPU usage and it continuously fires the moveend event.
L_PREFER_CANVAS = false;

// CONFIG OPTIONS ////////////////////////////////////////////////////
window.REFRESH = 30; // refresh view every 30s (base time)
window.ZOOM_LEVEL_ADJ = 5; // add 5 seconds per zoom level
window.REFRESH_GAME_SCORE = 5*60; // refresh game score every 5 minutes
window.MAX_IDLE_TIME = 4; // stop updating map after 4min idling
window.PRECACHE_PLAYER_NAMES_ZOOM = 17; // zoom level to start pre-resolving player names
window.HIDDEN_SCROLLBAR_ASSUMED_WIDTH = 20;
window.SIDEBAR_WIDTH = 300;
// chat messages are requested for the visible viewport. On high zoom
// levels this gets pretty pointless, so request messages in at least a
// X km radius.
window.CHAT_MIN_RANGE = 6;
// this controls how far data is being drawn outside the viewport. Set
// it 0 to only draw entities that intersect the current view. A value
// of one will render an area twice the size of the viewport (or some-
// thing like that, Leaflet doc isn’t too specific). Setting it too low
// makes the missing data on move/zoom out more obvious. Setting it too
// high causes too many items to be drawn, making drag&drop sluggish.
window.VIEWPORT_PAD_RATIO = 0.3;

// how many items to request each query
window.CHAT_PUBLIC_ITEMS = 200;
window.CHAT_FACTION_ITEMS = 50;
// how many pixels to the top before requesting new data
window.CHAT_REQUEST_SCROLL_TOP = 200;
window.CHAT_SHRINKED = 60;

// Leaflet will get very slow for MANY items. It’s better to display
// only some instead of crashing the browser.
window.MAX_DRAWN_PORTALS = 1000;
window.MAX_DRAWN_LINKS = 400;
window.MAX_DRAWN_FIELDS = 200;
// Minimum zoom level resonator will display
window.RESONATOR_DISPLAY_ZOOM_LEVEL = 17;

window.COLOR_SELECTED_PORTAL = '#f00';
window.COLORS = ['#FFCE00', '#0088FF', '#03FE03']; // none, res, enl
window.COLORS_LVL = ['#000', '#FECE5A', '#FFA630', '#FF7315', '#E40000', '#FD2992', '#EB26CD', '#C124E0', '#9627F4'];
window.COLORS_MOD = {VERY_RARE: '#F78AF6', RARE: '#AD8AFF', COMMON: '#84FBBD'};


// circles around a selected portal that show from where you can hack
// it and how far the portal reaches (i.e. how far links may be made
// from this portal)
window.ACCESS_INDICATOR_COLOR = 'orange';
window.RANGE_INDICATOR_COLOR = 'red';


window.DEFAULT_PORTAL_IMG = 'http://commondatastorage.googleapis.com/ingress/img/default-portal-image.png';
window.NOMINATIM = 'http://nominatim.openstreetmap.org/search?format=json&limit=1&q=';

// INGRESS CONSTANTS /////////////////////////////////////////////////
// http://decodeingress.me/2012/11/18/ingress-portal-levels-and-link-range/
var RESO_NRG = [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000];
var MAX_XM_PER_LEVEL = [0, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
var MIN_AP_FOR_LEVEL = [0, 10000, 30000, 70000, 150000, 300000, 600000, 1200000];
var HACK_RANGE = 40; // in meters, max. distance from portal to be able to access it
var OCTANTS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
var DESTROY_RESONATOR = 75; //AP for destroying portal
var DESTROY_LINK = 187; //AP for destroying link
var DESTROY_FIELD = 750; //AP for destroying field
var CAPTURE_PORTAL = 500; //AP for capturing a portal
var DEPLOY_RESONATOR = 125; //AP for deploying a resonator
var COMPLETION_BONUS = 250; //AP for deploying all resonators on portal

// OTHER MORE-OR-LESS CONSTANTS //////////////////////////////////////
var TEAM_NONE = 0, TEAM_RES = 1, TEAM_ENL = 2;
var TEAM_TO_CSS = ['none', 'res', 'enl'];
var TYPE_UNKNOWN = 0, TYPE_PORTAL = 1, TYPE_LINK = 2, TYPE_FIELD = 3, TYPE_PLAYER = 4, TYPE_CHAT = 5, TYPE_RESONATOR = 6;

var SLOT_TO_LAT = [0, Math.sqrt(2)/2, 1, Math.sqrt(2)/2, 0, -Math.sqrt(2)/2, -1, -Math.sqrt(2)/2];
var SLOT_TO_LNG = [1, Math.sqrt(2)/2, 0, -Math.sqrt(2)/2, -1, -Math.sqrt(2)/2, 0, Math.sqrt(2)/2];
var EARTH_RADIUS=6378137;
var DEG2RAD = Math.PI / 180;

// STORAGE ///////////////////////////////////////////////////////////
// global variables used for storage. Most likely READ ONLY. Proper
// way would be to encapsulate them in an anonymous function and write
// getters/setters, but if you are careful enough, this works.
var refreshTimeout;
var urlPortal = null;
window.playersToResolve = [];
window.playersInResolving = [];
window.selectedPortal = null;
window.portalRangeIndicator = null;
window.portalAccessIndicator = null;
window.mapRunsUserAction = false;
var portalsLayers, linksLayer, fieldsLayer;

// contain references to all entities shown on the map. These are
// automatically kept in sync with the items on *sLayer, so never ever
// write to them.
window.portals = {};
window.links = {};
window.fields = {};
window.resonators = {};

// plugin framework. Plugins may load earlier than iitc, so don’t
// overwrite data
if(typeof window.plugin !== 'function') window.plugin = function() {};


@@INJECTHERE@@


} // end of wrapper

// inject code into site context
var script = document.createElement('script');
script.appendChild(document.createTextNode('('+ wrapper +')();'));
(document.body || document.head || document.documentElement).appendChild(script);
