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

function testLabelSingle() {
  var messageId= GmailApp.search( "single message before ReLabelled" )[0].getMessages()[2].getId();
  var labelId= getLabelId( 'D70' );
  //modifyMessage( 'me', messageId, [labelId], []);
  modifyMessage( 'me', messageId, [], [labelId]);
}

function messageItselfMatches( message, filter ) {
        // Target the message via filter rfc822msgid: "Message-ID" header, which is different to message.getId().
        // Extracting 'Message-ID: ' from message.getRawContent().
        var content= message.getRawContent();
        var messageHeaderIdStart= content.indexOf( 'Message-ID: <');
        var messageHeaderIdEnd= content.indexOf( '>', messageHeaderIdStart );
        // Include < and > in the header value. messageExtended.payload.headers[headerIdx].value includes it, too.
        var messageHeaderId= content.substring( messageHeaderIdStart+ 'Message-ID: <'.length-1, messageHeaderIdEnd+1 );
        
        /* // Alternative way to get 'Message-ID' header. However, it involves a trip to extended API. Plus, it has headers etc. parsed, which involves more processing.
        var messageExtended= Gmail.Users.Messages.get( 'me', message.getId() );
        var messageHeaderId;
        for( var headerIdx in messageExtended.payload.headers ) {
            if( messageExtended.payload.headers[headerIdx].name==='Message-ID' ) {
              messageHeaderId= messageExtended.payload.headers[headerIdx].value;
            }
        }
        if( messageHeaderId===undefined ) {
          throw new Error( 'No header Message-ID in messageExtended.payload.headers' );
        }
        */
        var messageFilter= 'rfc822msgid:' +messageHeaderId+ ' ' +filter;
        var threads= GmailApp.search( messageFilter );
        
        if( threads.length>1 ) {
          throw new Error( 'Wrong message-specific filter - it matched multiple messages: ' +threads );
        }
        return threads.length===1;
}

// Based on https://gist.github.com/mogsdad/6515581#file-labelmessage-gs
// However, parameters are different - label IDs, not label names.
// @TODO fork & comment:
// messageId is same as message.getId() in Google Apps Script's GmailMessage object. It's not a value of the 'Message-ID' header on the message.
/**
 * Modify the Labels a Message is associated with.
 * Throws if unsuccessful.
 * see https://developers.google.com/gmail/api/v1/reference/users/messages/modify
 *
 * @param  {String} userId         User's email address. The special value 'me'
 *                                 can be used to indicate the authenticated user.
 * @param  {String} messageId      ID of Message to modify. Not rfc822msgid, but a result of GmailMessage.getId().
 * @param  {Array} labelsToAdd    Array of permanent Label IDs (not names) to add.
 * @param  {Array} labelsToRemove Array of permanent Label IDs (not names) to remove.
 *
 * @returns {Object}               Users.messages resource, see reference. 
 */
function modifyMessage(userId, messageId, labelIDsToAdd, labelIDsToRemove) {
  labelIDsToAdd = labelIDsToAdd || [];
  labelIDsToRemove = labelIDsToRemove || [];
  // see https://developers.google.com/gmail/api/v1/reference/users/messages/modify
  var url = 'https://www.googleapis.com/gmail/v1/users/${userId}/messages/${id}/modify'
            .replace("${userId}","me")
            .replace("${id}", messageId );
  var headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
  };
  var request = {
    'addLabelIds': labelIDsToAdd,
    'removeLabelIds': labelIDsToRemove
  };
  var params = {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  };
  //var check = UrlFetchApp.getRequest(url, params); // for debugging
  var response = UrlFetchApp.fetch(url, params);

  var result = response.getResponseCode();
  if (result == '200') {  // OK
    return JSON.parse(response.getContentText());
  }
  else {
    // This is only needed when muteHttpExceptions == true
    var err = JSON.parse(response.getContentText());
    throw new Error( 'Error (' + result + ") " + err.error.message );
  }
}

/**
 * Get the Label ID for the given LabelName. If Label isn't found, it will be created
 * depending on the state of ok2Create.
 * Throws if unsuccessful.
 * See https://developers.google.com/gmail/api/v1/reference/users/messages/modify.
 *
 * @param {String}   labelName
 * @returns {String}                  ID of Label, or null if not found.
 */
function getLabelId( labelName ) {
  var id = null;
  // see https://developers.google.com/gmail/api/v1/reference/users/labels/list
  var url = 'https://www.googleapis.com/gmail/v1/users/${userId}/labels'
            .replace("${userId}","me")  // The user's email address. The special value me can be used to indicate the authenticated user.
  var headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
  };
  var params = {
    method: "get",
    contentType: "application/json",
    headers: headers,
    muteHttpExceptions: true
  };
  
  //var check = UrlFetchApp.getRequest(url, params); // for debugging
  var response = UrlFetchApp.fetch(url, params);

  var result = response.getResponseCode();
  if (result == '200') {  // OK
    var labels = JSON.parse(response.getContentText()).labels;
    var found = false;
    for (var i=0; i<labels.length & !found; i++) {
      if (labels[i].name == labelName) {
        found = true;
        id = labels[i].id;
      }
    }
    return id;
  }
  else {
    // This is only needed when muteHttpExceptions == true
    var err = JSON.parse(response.getContentText());
    throw new Error( 'Error (' + result + ") " + err.error.message );
  }
}

/** OBSOLETE: The following attempt didn't work.
    <br/>
    Apps Script doesn't have a method to get/set/unset labels on per-message basis (only on per-thread basis).
    <br/>
    Getting labels of a message (rather than of any message in its thread), is difficult.
    Even if you run GmailApp.search( restrictive-filter-that-matches-the-message-rather-than-the-whole-thread ),
    that still returns the whole thread (rather than an object with that message only) for threads with two or more messages.
    To identify a message, run GmailApp.search(), possibly multiple times, with filter that targets
    the label(s) and the message itself - for example by rfc822msgid:<ID of that message> against message.getId().
    <br/>
    Setting/unsetting message-specific labels:
    1. Mark whether the message is in Inbox. Otherwise it is archived.
    2. Move the message to Thrash. That (temporarily) disconnects the message from its original thread.
       Now it will be in a thread on its own.
    3. Get labels, set/unset labels on the message - by calling callBack() method with the new thread (from Trash).
    4. Move the message back to Inbox, or to Archive. That re-connects it with its original thread.
    5. Return the value (if any) returned from callBack().
    @param GmailMessage message
    @param function callBack - to be called as callBack(singleItemThread)
    @return Value returned from callBack().

function ownLabels( message, callBack ) {
  if( message.isInTrash() ) {
    throw new Error("The message is in Trash already. Can't separate it from its thread (if any).");
  }
  if( message.getThread().isInSpam() ) {
    throw new Error("The message is in Spam. Not supported.");
  }
  var wasInInbox= message.isInInbox();
  message.moveToTrash();
  message.refresh();
  
  singleItemThread= message.getThread();
  if( singleItemThread.getMessages().length>1 ) {
    throw new Error( "Should have a single message, rather than " +singleItemThread.getMessages().length );
  }
  var result= callBack( singleItemThread );
  
  if( wasInInbox ) {
    GmailApp.moveThreadToInbox( singleItemThread );//@TODO test Draft
  }
  else {
    GmailApp.moveThreadToArchive( singleItemThread );
  }
  
  return result;
}

function testOwnLabels() {
  var D70= GmailApp.getUserLabelByName('D70');
  var threads= GmailApp.search( "deleted single message before ReLabelled" );
  ownLabels( threads[0].getMessages()[2],
    function callBack(singleItemThread) {
      singleItemThread;
      threads[0].addLabel( D70 );
    }
  );
}

function testDeleteSingle() {
  GmailApp.search( "single message before ReLabelled" )[0].getMessages()[2].moveToTrash();
}

function testSingleInThrash() {
  var messages= GmailApp.search( "in:trash deleted single message before ReLabelled" )[0].getMessages();
  if( messages.length>1 ) {
    throw new Error("More than 1: " +messages.length );
  }
}
*/