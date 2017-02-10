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
// @TODO property to list/match labels to exclude from spreading etc.
"use strict";

// @TODO rename */special-star-x2 to */**. Other ones rename to */LetteLetterSymbol, e.g. */OS* (orange star).
// ->>> easier typing of filters in GMail web interface
// Based on http://www.lifehacker.com.au/2011/12/fix-gmail-label-issues-with-an-app-script/

//@TODO Will an end user have to enable the following?
// Enable: Advanced GMail API as a resource in Google Apps Script. Then enable GMail API in your Google Developer center.

// In Gmail, receiving a reply to a deleted thread doesn't connect the reply with the deleted thread,
// until the thread is moved back to Inbox (i.e. undeleted).
// The other way, if the user deletes a single message from a thread, that disconnects the message from the thread
// (again, until the message is moved back to Inbox).

// Add any user labels, or IsStarred and HasXYZ labels, that exist on a  thread, to any new messages in that thread.
// (If a user adds a new label to a thread in GMail UI, that applies it to all messages in the thread at that moment. Nothing left to do.)
// This doesn't spread labels added by third party Google Script/API calls if performed after this already handled the message.
// @TODO rename to SpreadLabels()
/** @return boolean Whether it may have more work left to do. */
function ReLabel( stopTimeInMs ) {
  var ProcessedLabels= getLabel('ProcessedLabels', true);
  // @TODO properties & web interface: batch size, repetition interval
  var filter= '-label:' +filterize(ProcessedLabels.getName());
  Logger.log( 'ReLabel filter: ' +filter );
  
  
  // Match any thread that has at least one message that is not in ProcessedLabels. Some messages may already be in ReLabelled.
  var threads= GmailApp.search( filter, 0, 100 ); // Max. 100 threads. Otherwise ProcessedLabels.addToThreads(...) below fails.
  if( threads.length>0 ) {
    var NotReLabelledYet= getLabel('NotReLabelledYet!');
    var Replied= getLabel('Replied');
    var RepliedID;
    var starOriginalsLabelNames= starLabelNames('original-'); // We'll exclude labels that mark messages starred by the user, from any modifications.
    
    var processedThreads= [];
    for( var i=0; i<threads.length; i++ ) {
      var thread= threads[i];
      var labels= thread.getLabels(); // Labels of any message in the thread (some messages may have only some or no labels)
      
      for( var j=0; j<labels.length; j++ ) {
        var name= labels[j].getName();
        // Include (i.e. spread) star labels.
        // Exclude 'original' star labels - see starLabels(''). For handling of de-starred/deleted starred emails
        // we apply those labels only to the messages that have been starred, not to any other messages in the same threads.
        // Exclude ProcessedLabels and NotReLabelledYet!. This exclusion is for efficiency only.
        if( starOriginalsLabelNames.indexOf(name)<0 && name!==ProcessedLabels.getName()
          && (NotReLabelledYet===null || name!==NotReLabelledYet.getName())
          && (Replied===null || name!==Replied.getName())
        ) {
          Logger.log( 'Reapplying label ' +name );
          labels[j].addToThread( thread ); // re-apply the label to the whole thread
        }
      }
      if( Replied!==null ) {
        var labelNames= getLabelNames( labels );
        // Efficiency narrower
        if( labelNames.indexOf(Replied.getName()) >=0 ) { // Don't use labels.indexOf(Replied). See https://code.google.com/p/google-apps-script-issues/issues/detail?id=6435.
          var messages= thread.getMessages();
          // Add Replied, but only to any older emails. This is needed if using it with GMail filter (automatic rule), because a filter adds it to the specific message only.
          // Find the latest unprocessed message with Replied label. Apply to all older messages.
          // Assume messages are ordered by time. TODO test with timezones.
          for( var lastReplied=messages.length-1; lastReplied>=0; lastReplied-- ) {
            if( messageItselfMatches( messages[lastReplied], 'label:' +filterize(Replied.getName())+ ' ' +filter ) ) {
              break;
            }
          }
          if( lastReplied>0 ) {
            Logger.log( 'Applying label ' +Replied.getName()+ ' to message(s) older than message at 0-based index ' +lastReplied+ '.' );
            if( RepliedID===undefined ) {
              RepliedID= getLabelId( Replied.getName() );
            }
            for( var j=0; j<lastReplied; j++ ) {
              modifyMessage( 'me', messages[j].getId(), [RepliedID] );
            }
          }
        }
      }
      processedThreads.push( threads[i] );
      if( Date.now()>stopTimeInMs ) {
        break;
      }
    }
    ProcessedLabels.addToThreads(processedThreads);
    if( NotReLabelledYet!==null ) {
      NotReLabelledYet.removeFromThreads(processedThreads);
    }
    // Based on https://productforums.google.com/forum/#!topic/gmail/6cTJF4rrTng
    Logger.log( 'ReLabel finished ' +threads.length );
    return i<threads.length || threads.length===100;
  }
  else {
    return false;
  }
}

function CreateLabels() {
  createLabel( 'ProcessedLabels', true );
  createLabel( 'NotReLabelledYet!' );
  
  var filters= starFilters();
  for( var i=0; i<filters.length; i++ ) {
    createLabel( filters[i] );
    if( getLabel(filters[i]) ) {
      createLabel( 'original-' +filters[i], true );
    }
  }
  createLabel( 'AutoArchive' );
}

function createLabel( key, required ) {
  key= 'label-for-'+key;
  var name= PropertiesService.getUserProperties().getProperty(key);
  if( name!==null && name!=='' ) {
    if( GmailApp.getUserLabelByName(name)===null ) {
      //Create missing parent label(s)
      //FYI Suppose already had label Parent/Child1, Parent/Child2, but no Parent. Later we add Parent. Then 'Child1' and 'Child2' will show under 'Parent'.
      var indexOfSlash= 0;
      while( true ) {
        indexOfSlash= name.indexOf('/', indexOfSlash+1);
        if( indexOfSlash<0 ) {
          break;
        }
        var parentName= name.substring( 0, indexOfSlash );
        if( GmailApp.getUserLabelByName(parentName)===null ) {
          Logger.log( 'Creating parent label ' +name );
          GmailApp.createLabel( parentName );
        }
      }
      
      Logger.log( 'Creating label ' +name );
      GmailApp.createLabel( name );
    }
    else {
      Logger.log( 'Label ' +name+ ' exists already.' );
    }
  }
  else {
    Logger.log( 'No value, or empty, for property ' +key );
    if( required ) {
      throw new Error( 'No value, or empty, for property ' +key );
    }
  }
}

/*
Don't force a star on all emails in the thread, because (in conversation view)
- stars show per-message
- stars control which message(s) get expanded.
Instead, apply label '✸✸' (child of '*') to the whole thread, if any of its messages is starred.
(This skips messages in Trash or Spam.)

I. User unstars (or deletes) a starred message.
(When testing, GMail web UI doesn't show stars for deleted messages, until you restore them. However, the following filter  matches.)
Scripts picks up
- for any star:                {-is:starred in:trash} label:OriginallyStarred
- for particular type of star: {-has:XYZ in:trash}    label:OriginallyXYZ

GmailApp API doesn't filter starred threads by star color/shape, only by presence of any star. Hence use GmailApp.search() to match colored/shaped stars.

Suppose one, or some messages within a thread are starred (but not the whole thread). We can easily add a custom star label to the whole thread.

However, the user may remove all those stars later. How do we match such a thread efficiently?
-is:starred label:StarLabel would match any threads that have at least one message unstarred, not all of them unstarred.
To narrow down, when adding the custom star label to the whole thread, we add another label indicating the message
as 'originally starred'. Then we match -is:starred label:OriginallyStared. Similarly, we have two labels for each colored/shaped star.

Users: do not remove these labels manually. Otherwise, this will re-add it.

Script
1. Identify message(s) for step #3 below
1.1 iterate over all messages in the thread
1.2 search for filter rfc822msgid:<ID of that message> {-has:XYZ in:trash} label:OriginallyXYZ
    or for filter rfc822msgid:<ID of that message> {-is:starred  in:trash} label:OriginallyXYZ
    If it matches, that message was previously starred, but now is unstarred. Keep that message for step #3 below.
2. unsets label:XYZ on the whole thread;
3. unsets label:OriginallyXYZ on the message that had label:OriginallyXYZ but not the star (XYZ). (Do not unset this on the whole thread - see a note below.)
(Steps #2 and #3 are in this order, to be robust. In case #2 completes but #3 doesn't, this can be re-run.)

The above is processed first, even though in real timeline it comes after the following. This reversal allows the above
to remove label:XYZ from the whole thread, regardless of whether any other message in this thread still has the same star.
If there is another starred message in the thread, then the following will re-apply label:XYZ.

However, the second stage may have more matching records than the previous stage. If we limit batch processing, we won't
process all of them. They will be processed and will show up in label:XYZ until later.

II. User stars (a new message, or one in an existing thread).
Script picks up: has:XYZ -label:OriginallyXYZ

Script
1. Identify message(s) for step #3 below
1.1 iterate over all messages in the thread
1.2 search for rfc822msgid:<ID of that message> has:XYZ -label:OriginallyXYZ
2. sets label:XYZ on the thread.
3. sets label:OriginallyXYZ on the message(s) that didn't have label:OriginallyXYZ but are starred (has:XYZ). (Do not set this for the whole thread. See a note above.)
(Steps #2 and #3 are in this order, to be robust. In case #2 completes but #3 doesn't, this can be re-run.)
*/

function reStarNarrowFilter( filter, labelOriginalName, addingToOriginal ) {
  return addingToOriginal
    ?       filter+          ' -label:' +filterize(labelOriginalName)
    : '{-' +filter+ ' in:trash} label:' +filterize(labelOriginalName);
}

function ReStar( filter, label, labelOriginalName, stopTimeInMs ) {
  var mayHaveMoreWorkRemoving= ReStarWorker( false, filter, label, labelOriginalName, stopTimeInMs );
  var mayHaveMoreWorkAdding= ReStarWorker(   true,  filter, label, labelOriginalName, stopTimeInMs );
  return mayHaveMoreWorkRemoving || mayHaveMoreWorkAdding;
}

/** @return boolean Whether it may have more work left to do. */
function ReStarWorker( addingToOriginal, filter, label, labelOriginalName, stopTimeInMs ) {
  var affectedThreadsFilter= reStarNarrowFilter( filter, labelOriginalName, addingToOriginal );
  var affectedThreads= GmailApp.search( affectedThreadsFilter, 0, 500 );
  if( affectedThreads.length>0 ) {
    var labelOriginalID= getLabelId( labelOriginalName );
  }
  
  for( var i=0; i<affectedThreads.length; i++ ) {
    var messages= affectedThreads[i].getMessages();
    var triggeringMessageIDs= []; // IDs (not Message-ID headers) of messages that are triggering this change - either they god starred, or got unstarred/deleted and have been starred originally (depending on which stage we're processing)
    
    for( var j=0; j<messages.length; j++ ) {
      var message= messages[j];
      
      // 1.2
      // We have two alternatives. The first one is easier, but it only works for 'is:starred'. The other one demands higher data flow.
      if( false && filter==='is:starred' ) {
        /* Following condition is the same as affectedThreadsFilter for this message (excluding the label subfilter).
         Not extracting 'Message-ID: ' from message.getRawContent(), as that would include attachments -> big data flow.
         Instead, using Gmail.Users.Messages.get() and its getId().
         Alternatively, once Google fixes  https://code.google.com/p/google-apps-script-issues/issues/detail?id=1191, 
         use '*' collector sublabel to collect messages with any colored stars (has:XYZ). Then we won't need any special handling for is:starred,
         and remove this if() {....} branch.
        */
        if( message.isStarred()===addingToOriginal || !addingToOriginal && message.isInTrash() ) {
          
          var messageExtended= Gmail.Users.Messages.get( 'me', message.getId() );
          var messageHadOriginalLabel= messageExtended.labelIds.indexOf(labelOriginalID)>=0;
          // Don't use messageExtended.id - it is the same as message.getId(), but not 'Message-ID' header.
          
          if( messageHadOriginalLabel===!addingToOriginal ) {
            triggeringMessageIDs.push( message.getId() );
          }
        }
      }
      else {/*
        // Target the message via filter rfc822msgid: "Message-ID" header, which is different to message.getId().
        // Extracting 'Message-ID: ' from message.getRawContent().
        var content= message.getRawContent();
        var messageHeaderIdStart= content.indexOf( 'Message-ID: <');
        var messageHeaderIdEnd= content.indexOf( '>', messageHeaderIdStart );
        // Include < and > in the header value. messageExtended.payload.headers[headerIdx].value includes it, too.
        var messageHeaderId= content.substring( messageHeaderIdStart+ 'Message-ID: <'.length-1, messageHeaderIdEnd+1 );
        
        var triggeringMessageFilter= 'rfc822msgid:' +messageHeaderId+ ' ' +affectedThreadsFilter;
        var triggeringMessageThreads= GmailApp.search( triggeringMessageFilter );
        
        if( triggeringMessageThreads.length>1 ) {
          throw new Error( 'Wrong triggeringMessageFilter - it matched multiple messages: ' +triggeringMessageFilter );
        }*/
        if( messageItselfMatches( message, affectedThreadsFilter ) ) {
          triggeringMessageIDs.push( message.getId() );
        }
      }
    }
    
    // 2.
    addingToOriginal
      ? affectedThreads[i].addLabel(label)
      : affectedThreads[i].removeLabel(label);
    
    // 3
    for( var j=0; j<triggeringMessageIDs.length; j++ ) {
      modifyMessage( 'me', triggeringMessageIDs[j],
        addingToOriginal
          ? [labelOriginalID]
          : [],
        addingToOriginal
          ? []
          : [labelOriginalID]
      );
    }
    if( Date.now()>stopTimeInMs ) {
      return true;
    }
  }
  return affectedThreads.length===500;
}

function ReStarAll( stopTimeInMs ) {
  var filters= starFilters();
  
  var labels= starLabels(); //@TODO optimize
  var labelOriginalNames= starLabelNames('original-');
  
  /* Too long search string fails: The specified search is too long. Please specify a shorter search string.
     Good length: { (is:starred -label:ZZ-✸✸ {-is:starred in:trash} label:ZZ-✸✸) (has:yellow-star -label:ZZ-Y✸ {-has:yellow-star in:trash} label:ZZ-Y✸) (has:blue-star -label:ZZ-B✸ {-has:blue-star in:trash} label:ZZ-B✸) (has:red-star -label:ZZ-R✸ {-has:red-star in:trash} label:ZZ-R✸) (has:orange-star -label:ZZ-O✸ {-has:orange-star in:trash} label:ZZ-O✸) (has:green-star -label:ZZ-G✸ {-has:green-star in:trash} label:ZZ-G✸) (has:purple-star -label:ZZ-P✸ {-has:purple-star in:trash} label:ZZ-P✸) (has:red-bang -label:ZZ-R! {-has:red-bang in:trash} label:ZZ-R!) (has:yellow-bang -label:ZZ-Y! {-has:yellow-bang in:trash} label:ZZ-Y!) (has:blue-info -label:ZZ-Bi {-has:blue-info in:trash} label:ZZ-Bi) (has:orange-guillemet -label:ZZ-O- {-has:orange-guillemet in:trash} label:ZZ-O-) (has:green-check -label:ZZ-G✔ {-has:green-check in:trash} label:ZZ-G✔) (has:purple-question -label:ZZ-P? {-has:purple-question in:trash} label:ZZ-P?)}
     TODO However, it doesn't match - even though there were messages matching is:starred -label:ZZ-✸✸
  
  var compoundFilter= '';
  for( var i=0; i<filters.length; i++ ) {
    if( labels[i]!==null ) {
      compoundFilter+= ' (' +reStarNarrowFilter(filters[i], labelOriginalNames[i], true)+ ' ' +reStarNarrowFilter(filters[i], labelOriginalNames[i], false)+ ')';
    }
  }
  if( compoundFilter==='' ) {
    return false;
  }
  compoundFilter= '{' +compoundFilter+ '}';
  if( GmailApp.search(compoundFilter, 0, 1).length===0 ) {
    Logger.log( 'No star changes that need handling. No matches for compound filter: ' +compoundFilter );
    return false;
  }
  /**/
  
  var mayHaveMoreWork= false;
  for( var i=0; i<filters.length; i++ ) {
    if( labels[i]!==null ) {
      //Logger.log( 'ReStarAll-> label ' +labels[i].getName() );
      mayHaveMoreWork= ReStar( filters[i], labels[i], labelOriginalNames[i], stopTimeInMs ) || mayHaveMoreWork;
    }
    if( Date.now()>stopTimeInMs ) {
      break;
    }
  }
  return mayHaveMoreWork;
}

/*
Collect from sub-labels.
Users make those collector labels hidden in GMail > Settings > Labels, so they don't clutter GUI. Primary use is in filters to make filters short
& maintenance-free (automatically including any new sub-sub...-labels).
However, for multi level labels, this collects deep children only when there are collector labels at intermediate levels, too.
To exclude deeper labels from being collected for any higher parent, don't create collector under immediate parent label.
*/
function CollectSubLabelsPrepare() {
  // @TODO cache in properties; refresh & replace in properties, but less often than main processing
  // @cache sha/hashCode/simpleSum of JSON.stringify(value)
  // However, how to cache long global filter? Max 9kB per property. -label:
  // Max. allowed search filter has around 1362 characters (or equivalent in bytes?): { (is:starred -label:ZZ-✸✸ {-is:starred in:trash} label:ZZ-✸✸) (has:yellow-star -label:ZZ-Y✸ {-has:yellow-star in:trash} label:ZZ-Y✸) (has:blue-star -label:ZZ-B✸ {-has:blue-star in:trash} label:ZZ-B✸) (has:red-star -label:ZZ-R✸ {-has:red-star in:trash} label:ZZ-R✸) (has:orange-star -label:ZZ-O✸ {-has:orange-star in:trash} label:ZZ-O✸) (has:green-star -label:ZZ-G✸ {-has:green-star in:trash} label:ZZ-G✸) (has:purple-star -label:ZZ-P✸ {-has:purple-star in:trash} label:ZZ-P✸) (has:red-bang -label:ZZ-R! {-has:red-bang in:trash} label:ZZ-R!) (has:yellow-bang -label:ZZ-Y! {-has:yellow-bang in:trash} label:ZZ-Y!) (has:blue-info -label:ZZ-Bi {-has:blue-info in:trash} label:ZZ-Bi) (has:orange-guillemet -label:ZZ-O- {-has:orange-guillemet in:trash} label:ZZ-O-) (has:green-check -label:ZZ-G✔ {-has:green-check in:trash} label:ZZ-G✔) (has:purple-question -label:ZZ-P? {-has:purple-question in:trash} label:ZZ-P?) (is:starred -label:ZZ-✸✸ {-is:starred in:trash} label:ZZ-✸✸) (has:yellow-star -label:ZZ-Y✸ {-has:yellow-star in:trash} label:ZZ-Y✸) (has:blue-star -label:ZZ-B✸ {-has:blue-star in:trash} label:ZZ-B✸) (has:red-star -label:ZZ-R✸ {-has:red-star in:trash} label:ZZ-R✸) (has:orange-star -label:ZZ-O✸ {-has:orange-star in:trash} label:ZZ-O✸) (has:green-star -label:ZZ-G✸ {-has:green-star in:trash} label:ZZ-G✸)  bufobufobufobufobufobufobufobufobufobufobufob}
  var originalLabels= GmailApp.getUserLabels(); // When running max. 60x on the same day, this reached a  quota: "Service invoked too many times for one day: gmail"
  var labelNames= [];
  var originalIndexes= {}; // string labelName -> int index to originalLabels[]
  for( var i=0; i<originalLabels.length; i++ ) {
    labelNames[i]= originalLabels[i].getName();
    originalIndexes[ labelNames[i] ]= i;
  }
  
  labelNames.sort();
  // For bottom to up collection, we need the deepest child labels first, then parents.
  labelNames= labelNames.reverse();
  
  var labels= [], indexes= {}; // see return statement
  for( var i=0; i<labelNames.length; i++ ) {
    labels[i]= originalLabels[ originalIndexes[ labelNames[i] ] ];
    indexes[ labelNames[i] ]= i;
  }
  
  var parentNames= {};
  var collectorLeafName= propertyValueOrNull('label-for-collector');
  if( collectorLeafName===null ) {
    Logger.log( 'No property label-for-collector. Hence no collecting of sublabels.' );
    return;
  }
  for( var i=0; i<labelNames.length; i++ ) {
    var potentialCollectorName= labelNames[i];
    
    var indexOfSlashCollectorLeafName= potentialCollectorName.indexOf( '/'+collectorLeafName );
    if( indexOfSlashCollectorLeafName>=0 && indexOfSlashCollectorLeafName===potentialCollectorName.length-1-collectorLeafName.length ) { // since there's no string.endsWith() in Google App Script
      var parentName= potentialCollectorName.substring( 0, indexOfSlashCollectorLeafName );
      if( !(parentName in indexes) ) {
        throw new Error( 'parent folder inconsistent: ' +parentName );
      }
      parentNames[ parentName ]= true;
    }
  }
  
  var directChildNames= {}; // see return statement
  for( var i=0; i<labelNames.length; i++ ) {
    var childName= labelNames[i];
    
    var indexOfLastSlash= childName.lastIndexOf( '/' );
    if( indexOfLastSlash>0 ) {
      var parentName= childName.substring( 0, indexOfLastSlash );
      
      if( parentName in parentNames ) { // Not all parents have a direct collector subfolder.
      
        if( !(parentName in directChildNames) ) {
          directChildNames[parentName]= [];
        }
        if( childName!==parentName+'/'+collectorLeafName ) { // exclude registering collector sublabel itself
          directChildNames[parentName].push( childName );
        }
      }
    }
  }
  // directChildNames includes parents with no other child than collector sublabel. Then directChildNames[parentName] is an empty array.
  return {
    labels: labels, // In reverse alphabetical order
    indexes: indexes, // string labelName -> int index to labels[]
    parentNames: parentNames, // label name for which a direct collector sublabel exists => true
    directChildNames: directChildNames, // parentName => array[ string directChildName1, directChildName2... ]. In the same order (reverse alphabetical).
    collectorLeafName: collectorLeafName
  };
}

/** @param object prepared Result of CollectSubLabelsPrepare()
    @param number stopTimeInMs
    @return boolean Whether this task may have more work to do. False only if sure it has completed everything.
    @param {string|boolean true} previousRunLastParentName True if starting. String label name of the last fully processed parent label.
    It identifies from where to continue. That is stable because prepared.parentNames is ordered.
*/
function CollectSubLabels( prepared, stopTimeInMs, previousRunLastParentName ) {
  if( previousRunLastParentName===false ) {
    throw new Error('previousRunLastParentName must not be false. That should be handled by the caller (scheduler).');
  }
  if( previousRunLastParentName===true ) {
    previousRunLastParentName= undefined;
  }
  var firstPotentiallyUnfinishedParentName= false;
  var parentName;
  for( var i=0; i<prepared.labels.length; i++ ) {
    parentName= prepared.labels[i].getName();
    if( !(parentName in prepared.parentNames) ) {
      continue;
    }
    if( parentName in prepared.directChildNames ) {
      var childNames= prepared.directChildNames[parentName];
      if( previousRunLastParentName!==undefined ) {
        if( previousRunLastParentName!==parentName ) {
          continue;
        }
        previousRunLastParentName= undefined; // We reached it; no more checking, start working from here.
      }
      
      // A collector collects from its direct parent, from direct children of its direct parent
      // and from collectors (if any) of any direct children of its direct parent.
      
      // Remove collector label when a message drops out of a parent and all its direct sub-filters:
      // label:XYZ/* -{label:XYZ label:XYZ/Child1 label:XYZ/Child2...}
      var removalFilter= 'label:' +filterize( parentName+'/'+prepared.collectorLeafName )+ ' -{label:' +filterize(parentName);
      
      // -label:XYZ/* {label:XYZ label:XYZ/Child1 label:XYZ/Child2...}
      var additionFilter= '-label:' +filterize( parentName+'/'+prepared.collectorLeafName )+ ' {label:' +filterize(parentName);
      
      for( var j=0; j<childNames.length; j++ ) {
        var childName= childNames[j];
        var subFilter;
        if( childName in prepared.directChildNames ) { // childName itself is a parent with a collector-sublabel
          // The child has a collector sub-label, hence collect from that collector. That includes messages in the child itself.
          subFilter= ' label:' +filterize(childName+'/'+prepared.collectorLeafName);
        }
        else {
          // The child doesn't have a collector sub-label (even though it may have regular sub-labels). Hence collect from the child only.
          subFilter= ' label:' +filterize(childName);
        }
        removalFilter+= subFilter;
        additionFilter+= subFilter;
      }
      
      removalFilter+= '}';
      additionFilter+= '}';
      Logger.log( 'removal: ' +removalFilter);
      Logger.log( 'addition: '+additionFilter);
      
      var threadsToHaveLabelRemoved= GmailApp.search(removalFilter, 0, 100);
      var threadsToHaveLabelAdded= GmailApp.search(additionFilter, 0, 100);
      
      var collectorLabel= prepared.labels[ prepared.indexes[parentName+'/'+prepared.collectorLeafName] ];
      collectorLabel.removeFromThreads( threadsToHaveLabelRemoved );
      collectorLabel.addToThreads( threadsToHaveLabelAdded );
      
      firstPotentiallyUnfinishedParentName= firstPotentiallyUnfinishedParentName ||
        (threadsToHaveLabelRemoved.length===100 || threadsToHaveLabelAdded.length===100
         ? parentName
         : false
        );
      if( Date.now()>stopTimeInMs ) {
        break;
      }
    }
  }
  return firstPotentiallyUnfinishedParentName ||
    (i<prepared.labels.length
     ? parentName
     : false
    );
}

/** No need for stopTimeInMs.
    @return boolean Whether this task may have more work to do. False only if sure it has completed everything.
*/
function AutoArchive() {
  var label= getLabel( 'AutoArchive' );
  if( label===null ) {
    return false;
  }
  var threads= GmailApp.search( 'is:inbox label:' +filterize(label.getName()), 0, 100 ); // Max. 100 threads. Otherwise GmailApp.moveThreadsToArchive() below may fail.
  GmailApp.moveThreadsToArchive( threads );
  return threads.length===100;
}

function timeCollectSubLabelsPrepare() {
  var startTimeInMs= Date.now();
  var prepared= CollectSubLabelsPrepare();
  Logger.log( "CollectSubLabelsPrepare() took " +(Date.now()-startTimeInMs)+ " ms." ); //900ms for 500 labels
  Logger.log( '' +GmailApp.getUserLabels().length+ ' user labels.' );
}
  
//@TODO Document: We check stopTimeInMs after processing at least some of the work. Document: The caller (scheduler) checks time first. That allows atomic (non-splittable) task function to do its job without checking the time.
function RunAll() {
  var stopTimeInMs= Date.now()+4*60*1000-10000; // This must be less than time trigger period. 
  var prepared= CollectSubLabelsPrepare();
  
  /** Following functions stop either on reaching stopTimeInMs, or after processing their batch.
  */
  var jobs= [
    ReStarAll,
    ReLabel,
    AutoArchive,
    function(stopTimeInMs, previousRunLastParentName) { return CollectSubLabels( prepared, stopTimeInMs, previousRunLastParentName ); }
  ];
  
  var mayHaveMoreWork= []; // Entries may be boolean, indicating whether the job may have anything more to do, or any token indicating where the previous run finished.
  for( var i=0; i<jobs.length; i++ ) {
    mayHaveMoreWork[i]= true;
  }
  
  var previousJobsCompleted;
  var i=0;
  do {
    
    //G. Apps Script-specific: Following call was difficult to debug.
    mayHaveMoreWork[i]= mayHaveMoreWork[i] && jobs[i]( stopTimeInMs, mayHaveMoreWork[i] );
    
    if( i===0 ) {
      previousJobsCompleted= true;
    }
    previousJobsCompleted= previousJobsCompleted && !mayHaveMoreWork[i];
    if( i===jobs.length-1 && previousJobsCompleted ) {
      //@TODO if time left, Utilities.sleep(milisec). However, then we can't trigger this at fixed intervals!
      //Even if we had a longer main interval, the user may shorten the interval via https://script.google.com > Resources > All Your Triggers
      break;
    }
    i++;
    i%=jobs.length;
  } while( Date.now()<stopTimeInMs );
  //@TODO if incomplete, store mayHaveMoreWork[3] - for CollectSubLabels - in a user's property.
  //Then add a robustness check to CollectSubLabels(): If its param previousRunLastParentName (which is passed from mayHaveMoreWork[3])
  //doesn't exist in parentNames anymore, re-start iterating parentNames.
  Logger.log( 'RunAll(): '
    +(
      i===jobs.length-1
      && previousJobsCompleted
         ? "All jobs completed."
         : "Some jobs completed. Potentially uncomplete: " +mayHaveMoreWork
    )
  );
}

function callF() {
  GlobVar.x= 1;
  f();
  Logger.log( 'CallF done');
}

function setUpTrigger() {  
  removeTriggers();
  ScriptApp.newTrigger("RunAll").timeBased().everyMinutes(30).create();  
  //Browser.msgBox("Initialized", "The program is now running.", Browser.Buttons.OK);  
}

function testSetUpOnce() {  
  //ScriptApp.newTrigger("callF").timeBased().after(2000).create();  -- not working, or not well, or not logging, or log disappears.
  //ScriptApp.newTrigger("callF").timeBased().everyMinutes(1).create();  
}


function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();  
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);    
  }
}

/* Following was not robust. It ended up with many triggers.
function RunAllRecurrent() {
  RunAll();
  // If RunAll() threw or run out of time, then our service stops!
  ScriptApp.newTrigger("RunAllRecurrent")
   .timeBased()
   .after(20 * 60 * 1000)
   .create();
}*/

// RunAllRecurrent()