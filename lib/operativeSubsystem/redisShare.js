'use strict';

module.exports = {
    init,

    shareValue,
    shareValueExclusive,
    shareMany,
    getShare,
    incrementAndGetShare,
    unshare,
    unshareMany,
    listenShareEqualTo
};

var _ = require('lodash');

var redisConnection = require('./redisConnection.js');

const CHANNEL_NAME = 'rshl';

var putListenersHere = {};

function init(){
    redisConnection.getTheListener().getRedis().on('message', opHandleMessage);
    redisConnection.getTheListener().getRedis().subscribe(CHANNEL_NAME);
}
function opHandleMessage(channel, message){
    if(channel === CHANNEL_NAME && putListenersHere[message]){
        let toCall = putListenersHere[message];
        delete putListenersHere[message];
        toCall();
    }
}

function shareValue(tabName, theKey, theValue, callback){
    redisConnection.getTheClient().shareValueWithCheck([tabName, theKey, theValue], callback);
}
function shareValueExclusive(tabName, theKey, theValue, callback){
    let callbackFn = (err, response) => {
        if(err){
            callback(err);
        } else {
            callback(null, !!response);
        }
    };

    redisConnection.getTheClient().shareValueExclusive([tabName, theKey, theValue], callbackFn);
}
function shareMany(tabName, keysAndValues, callback){
    var args = [tabName];
    _.each(keysAndValues, (v, k) => args.push(k, v));
    redisConnection.getTheClient().shareValueWithCheck(args, callback);
}
function getShare(tabName, theKey, callback){
    redisConnection.getTheClient().getRedis().hget(tabName, theKey, callback);
}
function incrementAndGetShare(tabName, theKey, callback){
    let callbackFn = (err, response) => {
        if(err){
            callback(err, null);
        } else if(response){
            response = response.split(';');
            if(response.length > 1){
                callback(null, response.map(e => +e));
            } else {
                callback(null, +response[0]);
            }
        } else {
            callback(null, null);
        }
    };

    redisConnection.getTheClient().incrementValueWithCheck([tabName, theKey, 1], callbackFn);
}
function unshare(tabName, theKey, callback){
    redisConnection.getTheClient().getShareTheLastTime([tabName, theKey], callback);
}
function unshareMany(tabName, callback){
    redisConnection.getTheClient().getRedis().del(tabName, callback);
}
function listenShareEqualTo(tabName, theKey, preferableValue, callback){
    putListenersHere[`${tabName}-${theKey}`] = callback;
    redisConnection.getTheClient().setTheListenedShareAndCheck([tabName, theKey, preferableValue], err => {
        if(err){
            console.error(err);
        }
    });
}