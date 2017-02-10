/*  Copyright 2017 Peter Kehl
    This file is part of PowerMute.
    PowerMute is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    PowerMute is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with PowerMute.  If not, see <http://www.gnu.org/licenses/>.
*/
"use strict";

function testDownloadScript() {
  var files= DriveApp.getFilesByName("PowerMute");
  while (files.hasNext()) {
   var file = files.next();
   Logger.log( file.getName()+ " of type " +file.getMimeType() );
    Logger.log( file.getId() );
    Logger.log( file.getUrl() );
    
    Logger.log( getAppsScriptAsJson('PowerMute') );
    //var blob= file.getBlob(); // This failed: Converting from application/vnd.google-apps.script to application/pdf is not supported.
    //var blob= file.getAs('application/vnd.google-apps.script'); // -> blob.getDataAsString() returns null
    //var blob= file.getAs('text/json');
    //var blob= file.getAs('text/plain');
    //Logger.log( blob.getDataAsString() );
  }
}

// Before running this, enable the Drive API go to Resources -> Advanced Google Services, find the Drive API and turn on.
// From http://stackoverflow.com/questions/31181918/get-json-of-container-bound-google-apps-script-through-apps-script-or-download
function getAppsScriptAsJson( fileName ) {
  var fileDrive = Drive.Files.get( DriveApp.getFilesByName( fileName ).next().getId() );
  var link = JSON.parse(fileDrive)[ 'exportLinks' ][ 'application/vnd.google-apps.script+json' ];
  var fetched = UrlFetchApp.fetch(link, {headers:{'Accept':'application/vnd.google-apps.script+json', "Authorization":'Bearer '+ScriptApp.getOAuthToken()}, method:'get'});
  return JSON.parse(fetched.getContentText());
}

function testSimple() {
  try {
    getLabel('ProcessedLabels', true).addToThreads( []);
  }
  catch(e) {
    Logger.log( ''+e );
  }
}

/*
function listLabelInfo() {
  var response =
    Gmail.Users.Labels.list('me');
  for (var i = 0; i < response.labels.length; i++) {
    var label = response.labels[i];
    Logger.log(JSON.stringify(label));
  }
}/**/

function bug() {
  var filter= 'has:blue-star';
  var threads= GmailApp.search( filter, 0, 500 );
  Logger.log( filter+ ' -> ' +threads.length+ ' thread(s).' );
}

function testHasFilter() {
  Logger.log( GmailApp.getUserLabelByName( 'Has/AnyStar' ).getName() );
}

function unicodeLabel() {
  Logger.log( GmailApp.getUserLabelByName('uni▶✉✦❤➡✖✔✸●■◢◣◤◥◧◨◩◪▲▼▶◀♂♀♪♫☼code') );
  Logger.log( GmailApp.search('label:uni▶✉✦❤➡✖✔✸●■◢◣◤◥◧◨◩◪▲▼▶◀♂♀♪♫☼code').length );
}

// For https://code.google.com/p/google-apps-script-issues/issues/detail?id=6435
function testLabelsIndexOf() {
  var labels= GmailApp.getUserLabels();
  Logger.log( "1st label (at index 0) " +labels[0].getName()+ " is confirmed at position " +labels.indexOf(labels[0]) );
}

function testLabelNamesIndexOf() {
  var labels= GmailApp.getUserLabels();
  var names= getLabelNames( labels );
  Logger.log( "1st label name (at index 0) " +names[0]+ " is confirmed at position " +names.indexOf(names[0]) );
}

function testRemoveLabelFromNoThreads() {
  var ProcessedLabels= getLabel('ProcessedLabels', true);
  var NotReLabelledYet= getLabel('NotReLabelledYet!');
  ProcessedLabels.removeFromThreads([]);
  NotReLabelledYet.removeFromThreads([]);
}
// For testing https://code.google.com/p/google-apps-script-issues/issues/detail?id=1191
function testColoredStarFilters() {
  var filter= '{has:blue-star has:red-star has:orange-star has:green-star has:purple-star has:red-bang has:yellow-bang has:blue-info has:orange-guillemet has:green-check has:purple-question} ';
  Logger.log( 'Colored star filter returned ' +GmailApp.search( filter, 0, 500 ).length+' matches.' );
}

function testProp() { Logger.log( PropertiesService.getUserProperties().getProperty('label-for-collector') ); }

function testRemoveMyUnusedStarsProperties() {
  var properties= PropertiesService.getUserProperties();
  properties.deleteProperty(  'label-for-has:orange-star');
  properties.deleteProperty(  'label-for-has:red-star');
  properties.deleteProperty(  'label-for-has:purple-star');
  properties.deleteProperty(  'label-for-has:blue-star');
  properties.deleteProperty(  'label-for-has:green-star');
  properties.deleteProperty(  'label-for-has:yellow-bang');
  /*properties.deleteProperty(  'label-for-has:orange-guillemet');
  properties.deleteProperty(  'label-for-has:green-check');
  properties.deleteProperty(  'label-for-has:purple-question' );*/
  //properties.deleteProperty(  'label-for-NotReLabelledYet!' );
  //properties.deleteProperty(  'label-for-AutoArchive' );
}
function testRemoveAllProperties() { PropertiesService.getUserProperties().setProperties( {}, true/*delete others*/ ); }
function testPad() {
  //Logger.log( "abcabc".indexOf('a', 1) );
  Logger.log( PropertiesService.getUserProperties().getProperty('label-for-NotReLabelledYet!') );
}

function testHasXYZstarFilters() {
  var filters= starFilters();
  var hasXYZfilter= '{';
  for( var i=0; i<filters.length; i++ ) {
    if( filters[i]!=='is:starred' ) {
      hasXYZfilter+= filters[i]+ ' ';
    }
  }
  hasXYZfilter+= '}';
  var numOfThreads= GmailApp.search( hasXYZfilter, 0, 500 ).length;
  if( numOfThreads===0 ) {
    throw new Error( 'No messages matching ' +hasXYZfilter );
  }
  Logger.log( numOfThreads+'+ message(s) matching ' +hasXYZfilter );
}

/* This proves we can't modify system objects. Hence, call PropertiesService.getUserProperties() whenever needed, rather than store its result.
function testObjectReuse() {
  var prop= PropertiesService.getUserProperties();
  prop.customized= 1;
  Logger.log( 'Can reuse: ' +('customized' in PropertiesService.getUserProperties() ) );
}*/

var GlobVar= {};
function f() {
  GlobVar.x= 1;
}