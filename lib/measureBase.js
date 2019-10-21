'use strict';

module.exports = {
    pushPreparedSample,
    startMeasure,
    finishMeasure,
    prepareBenchmarkTimingSample,
    returnBackBenchmarkTimingSample
};

var _ = require('lodash');

var redisConnection = require('./operativeSubsystem/redisConnection.js'),
    redisShare = require('./operativeSubsystem/redisShare.js');

function pushPreparedSample(head, domainN, errored, code, startTs, doneTs, durationTs, benchmarkTiming, xDuration, callback){
    var theSample = `err:${+!!errored};code:${code}`;

    if(startTs && doneTs){
        theSample = `${theSample};durs:${startTs};durd:${doneTs}`;
    }
    if(durationTs){
        theSample = `${theSample};dur:${durationTs}`;
    }
    if(benchmarkTiming){
        theSample = `${theSample};bt:${benchmarkTiming}`;
    }
    if(xDuration){
        theSample = `${theSample};xdur:${xDuration}`;
    }
    redisConnection.getTheClient().getRedis().hset(`msr:${head}`, domainN, theSample, callback);
}
function startMeasure(head, domainN, callback){
    let callbackFn = (err, success) => {
        if(err){
            callback(err);
        } else if(success){
            callback(null);
        } else {
            callback(new Error('Already measuring that'))
        }
    };

    redisShare.shareValueExclusive(`msrm:${head}`, domainN, _.now(), callbackFn);
}
function finishMeasure(head, domainN, callback){
    var theNow = _.now(),
        theNowOfShare, theDuration;

    function getShareMark(){
        let callbackFn = (err, theShare) => {
            if(err){
                callback(err);
            } else if(theShare){
                theNowOfShare = +theShare;
                theDuration = theNow - theNowOfShare;
                doPushMeasure();
            } else {
                callback(new Error('Does not measure that currently'));
            }
        };

        redisShare.unshare(`msrm:${head}`, domainN, callbackFn);
    }
    function doPushMeasure(){
        let callbackFn = err => {
            if(err){
                callback(err);
            } else {
                callback(null, theDuration);
            }
        };

        redisConnection.getTheClient().getRedis().hset(`msr:${head}`, domainN, `err:0;code:200;dur:${theDuration};durs:${theNowOfShare};durd:${theNow}`, callbackFn);
    }

    getShareMark();
}

function prepareBenchmarkTimingSample(sample){
    return sample.split(':').join('^');
}
function returnBackBenchmarkTimingSample(sample){
    return sample.split('^').join(':');
}