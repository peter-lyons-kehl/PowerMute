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

/* If we need hashCode
// Based on http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
function hashCode( string ) {
  var hash = 0;
  for (var i = 0, len = string.length; i < len; i++) {
    var chr   = string.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}/**/

function starFilters() {
  // Case sensitive:
  return ['is:starred', 'has:yellow-star', 'has:blue-star', 'has:red-star', 'has:orange-star',
              'has:green-star', 'has:purple-star', 'has:red-bang', 'has:yellow-bang',
              'has:blue-info', 'has:orange-guillemet', 'has:green-check', 'has:purple-question' ];
}

// It includes null-s for stars with non-existing or empty labelnames
function starLabelNames( prefix ) {
  prefix= prefix || '';
  var filters= starFilters();
  var result= [];
  for( var i=0; i<filters.length; i++ ) {
    result.push( getLabelName( prefix+filters[i] ) );
  }
  return result;
}

// It includes null-s for stars with non-existing labels
function starLabels( prefix ) {
  var labelNames= starLabelNames(prefix);
  var result= [];
  for( var i=0; i<labelNames.length; i++ ) {
    result.push( getLabelByName( labelNames[i] ) );
  }
  return result;
}

// Use as getLabelNames( labels ).indexOf( targetLabelName ). It's instead of labels.indexOf(label) -see https://code.google.com/p/google-apps-script-issues/issues/detail?id=6435.
function getLabelNames( labels ) {
  var names= [];
  for( var i=0; i<labels.length; i++ ) {
    names.push( labels[i].getName() );
  }
  return names;
}

function defaultStarLabelNames() { // without prefix
    return [
      // To order them together in GMail list of labels, all star-related labels start with '*'.
      '**',
      'Y*',
      'B*',
      'R*',
      'O*',
      'G*',
      'P*',
      'R!',
      'Y!',
      'Bi',
      'O\u00BB', // O»
      'G\u2714', // G✔
      'P?'
    ];
    return [
      // To order them together in GMail list of labels, all star-related labels start with '*'.
      // '\u2738' -> ✸ - more readable on small devices than '\u2042A' -> ⁂
      // See https://en.wikipedia.org/wiki/List_of_Unicode_characters.
      '\u2738\u2738', // ✸✸
      'Y\u2738', // Y✸
      'B\u2738', // B✸
      'R\u2738', // R✸
      'O\u2738', // O✸
      'G\u2738', // G✸
      'P\u2738', // P✸
      'R!', // R!
      'Y!', // Y!
      'Bi', // Bi
      'O\u00BB', // O»
      'G\u2714', // G✔
      'P?' // P?
    ];
}

function initializeProperties() {
  /* Move the logic to RunAll() or web interface
  If we don't run this Apps script function by function.
  var createLabelsForStars= userProperties.getProperty('createLabelsForStars');
  if( createLabelsForStars===null ) {
    userProperties.getProperty('createLabelsForStars', 'false');
  }
  if( createLabelsForStars==='true' ) {*/
    initializeMissingPropertiesPrivate( 'label-for-', starFilters(), '*/', defaultStarLabelNames() );
    initializeMissingPropertiesPrivate( 'label-for-original-', starFilters(), 'ZZ/' /** To show after most user labels. */, defaultStarLabelNames() );
    initializeMissingPropertiesPrivate( 'label-for-',
      [
       'NotReLabelledYet!',
       'ProcessedLabels',
       'collector'
      ],
      '', // empty prefix
      [
       '*/NotReLabelledYet!', // It is under a star '*', so it shows before user-defined labels, to warn them about potentially missing labels.
       'ZZ/\u25A1', // ZZ/□ Non-intrusive yet visible. We can't make it invisible by GMail > Settings > Labels change its color to white on white, because GMail then 'adjusts' it.
       '*' /* OK for both 'collector' and the parent of starFilters()-based labels (not 'original' ones)
              to be the same (a star '*'),
              since the parent of starFilters()-based labels is at the top level, while 'collector'
              is never at top level but it's a leaf. */
      ]
    );
    initializeMissingPropertiesPrivate( 'label-for-', ['AutoArchive'], '', ['*/AutoArchive'] ); // By prefixing with '*' it shows up high on the list.
    initializeMissingPropertiesPrivate( 'label-for-', ['Replied'], '', ['*/Replied'] ); // By prefixing with '*' it shows up high on the list.
}

/** @private
    @param defaultValues in the same order as keyPostfixes
*/
function initializeMissingPropertiesPrivate( keyPrefix, keyPostfixes, valuePrefix, defaultValues ) {
  var userProperties = PropertiesService.getUserProperties();
  for( var i=0; i<keyPostfixes.length; i++ ) {
    var key= keyPrefix+keyPostfixes[i];
    //@TODO User documentation: an empty value indicates not to auto-create a label.
    if( userProperties.getProperty(key)===null ) {
      userProperties.setProperty( key, valuePrefix+defaultValues[i] );
    }
  }
}

function propertyValueOrNull( key ) {
  var value= PropertiesService.getUserProperties().getProperty( key );
  return value!=='' // User indicates null by saving an empty string. (Since properties are strings only and don't differentiate between null and not present.)
    ? value
    : null;
}

/** @return string label name, or null (also for property with an empty string as a value).
*/
function getLabelName(key, required ) {
  required= required || false;
  var propertyName= 'label-for-'+key;
  var labelName= propertyValueOrNull(propertyName);
  if( labelName===null && required ) {
    throw new Error( 'Missing a required property ' +propertyName );
  }
  if( labelName==='' ) {
    if( required ) {
      throw new Error( 'Required property ' +propertyName+ ' is set, but empty.' );
    }
    return null;
  }
  return labelName;
}

function getLabelByName( labelName, required ) {
  if( labelName===null || labelName==='' ) {
    return null;
  }
  var label= GmailApp.getUserLabelByName( labelName );
  if( label===null && required ) {
    throw new Error( 'Missing label ' +labelName );
  }
  return label;
}

// Can't call this function 'label'. It caused a conflict with G. Apps Script.
function getLabel( key, required ) {
  return getLabelByName( getLabelName(key, required) );
}

// For Parent/Child folder, using filter label:Parent-Child, rather than label:Parent/Child. That's because
// in Gmail GUI, the first filter returns the exact number of threads, but the second doesn't.
function filterize( labelName ) {
  // GMail labels refuse ^ but they accept all other special characters on US keyboard: ~!#$%&*()-_+={}[];'\,./:"|<>?|`@
  // When searching for such label, it replaces only some with a dash:            label:~!#$%-*---_+=--[];'\,.-:--<>?-`@
  // Unicode characters (past ASCII) seem to work: ▶✉✦❤➡✖✔✸●■◢◣◤◥◧◨◩◪▲▼▶◀♂♀♪♫☼. Hence allow any unicode (charcode over 255).
  var result= '';
  for( var i=0; i<labelName.length; i++ ) {
    if( labelName.charCodeAt(i) >255 ) {
      result+= labelName[i];
    }
    else {
      result+= labelName[i].replace( /[^a-z0-9~!#$%*\_+=\[\];'\\,.:<>\?`@-]/i, '-' );
    }
  }
  return result;
}
