'use strict';

module.exports = {
    beginBenchmark
};

var redisShare = require('../lib/operativeSubsystem/redisShare.js'),
    benchSingleActBase = require('../lib/benchSingleActBase.js'),
    measureBase = require('../lib/measureBase.js');

function beginBenchmark(targetHost, targetPort, bulkSize, workloadFromTo, callback) {
    var from, to;

    function lockBefore(){
        let callbackFn = (err, workDistribution) => {
            if (err) {
                callback(err);
            } else {
                [from, to] = workloadFromTo ? workloadFromTo : [workDistribution[0], workDistribution[1]];
                runActs();
            }
        };

        require('../lib/operativeSubsystem/redisLocker.js').lockInProcess('builtin-records', callbackFn);
    }
    function runActs(){
        function postARecord(){
            let callbackFn = err => {
                if(err){
                    callback(err);
                } else {
                    getPlayerRecord();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        postProxy(`/tops.postARecord?value=1&segment=def`, null, key, null, targetHost, targetPort, null, null, cb);
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-records-postARecord', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function getPlayerRecord(){
            let callbackFn = err => {
                if(err){
                    callback(err);
                } else {
                    getLeadersOverall();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        getProxy(`/tops.getPlayerRecord?segment=def`, key, null, targetHost, targetPort, null, null, cb);
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-records-getPlayerRecord', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function getLeadersOverall(){
            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        getProxy(`/tops.getLeadersOverall?segment=def`, key, null, targetHost, targetPort, null, null, cb);
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-records-getLeadersOverall', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callback);
        }

        postARecord();
    }

    lockBefore();
}