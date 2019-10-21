'use strict';

module.exports = {
    beginBenchmark
};

var async = require('async');

var redisShare = require('../lib/operativeSubsystem/redisShare.js'),
    benchSingleActBase = require('../lib/benchSingleActBase.js'),
    measureBase = require('../lib/measureBase.js');

function beginBenchmark(targetHost, targetPort, bulkSize, callback) {
    var from, to;

    function lockBefore(){
        let callbackFn = (err, workDistribution) => {
            if (err) {
                console.log(`${process.env.i} | lockBefore @ beginBenchmark @ accountAndProfile.js... ERROR`);
                callback(err);
            } else {
                [from, to] = [workDistribution[0], workDistribution[1]];
                console.log(`${process.env.i} | lockBefore @ beginBenchmark @ accountAndProfile.js... OK from=${from} to=${to}`);
                runActs();
            }
        };

        console.log(`${process.env.i} | lockBefore @ beginBenchmark @ accountAndProfile.js...`);
        require('../lib/operativeSubsystem/redisLocker.js').lockInProcess('builtin-accountAndProfile', callbackFn);
    }
    function runActs(){
        function getAccount1(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | getAccount1 @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | getAccount1 @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    createProfile();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) =>
                postProxy(`/accounts.getAccount`, null, null, null, targetHost, targetPort, null, null, cb);

            let onResponse = (n, statusCode, body, result, cb) => {
                async.series([
                    acb => {
                        if(!body.gClientId || !body.gClientSecret){
                            acb(new Error('No G Client Id or Secret on body'));
                        } else if(!body.unicorn){
                            acb(new Error('No unicorn on body'));
                        } else {
                            async.series([
                                _cb => redisShare.shareValue('gclientids', n, body.gClientId, _cb),
                                _cb => redisShare.shareValue('gclientsecrets', n, body.gClientSecret, _cb),
                                _cb => redisShare.shareValue('unicorns', n + 1, body.unicorn, _cb)
                            ], acb);
                        }
                    },
                    acb => measureBase.pushPreparedSample('builtin-accountAndProfile-getAccount1', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, acb)
                ], cb)
            };

            console.log(`${process.env.i} | getAccount1 @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function createProfile(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | createProfile @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | createProfile @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    getAccount2();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        getProxy(`/profile.createProfile`, key, null, targetHost, targetPort, null, null, cb)
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                async.series([
                    _cb => redisShare.shareValue('humanId', n, body.humanId, _cb),
                    _cb => measureBase.pushPreparedSample('builtin-accountAndProfile-createProfile', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, _cb)
                ], cb);
            };

            console.log(`${process.env.i} | createProfile @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function getAccount2(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | getAccount2 @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | getAccount2 @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    getProfile();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, keys) => {
                    if(err){
                        cb(err);
                    } else {
                        getProxy(
                            `/accounts.getAccount?vkid=${n + 1}&vksecret=${keys[0]}`, keys[1], null,
                            targetHost, targetPort, null, null, cb
                        )
                    }
                };

                async.parallel([
                    cbf => redisShare.getShare('fake_auth_keys', n + 1, cbf),
                    cbf => redisShare.getShare('unicorns', n + 1, cbf)
                ], cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-accountAndProfile-getAccount2', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            console.log(`${process.env.i} | getAccount2 @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function getProfile(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | getProfile @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | getProfile @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    setProfile();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        getProxy(`/profile.getProfile`, key, null, targetHost, targetPort, null, null, cb)
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-accountAndProfile-getProfile', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            console.log(`${process.env.i} | getProfile @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function setProfile(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | setProfile @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | setProfile @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    updateProfile();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        postProxy(
                            `/profile.setProfile`, { publicProfileData: { name: 'publicName' }, ver: 2 },
                            key, null, targetHost, targetPort, null, null, cb
                        );
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-accountAndProfile-setProfile', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            console.log(`${process.env.i} | setProfile @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function updateProfile(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | updateProfile @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | updateProfile @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    modifyProfile();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        postProxy(`/profile.updateProfile`, { ver: 3 }, key, null, targetHost, targetPort, null, null, cb);
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-accountAndProfile-updateProfile', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            console.log(`${process.env.i} | updateProfile @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function modifyProfile(){
            let callbackFn = err => {
                if(err){
                    console.log(`${process.env.i} | modifyProfile @ runActs @ beginBenchmark @ accountAndProfile.js... ERROR`);
                    callback(err);
                } else {
                    console.log(`${process.env.i} | modifyProfile @ runActs @ beginBenchmark @ accountAndProfile.js... OK`);
                    getPublicProfile();
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        postProxy(
                            `/profile.modifyProfile`, [{ set: 'profileData.name', val: 'AnotherName' }],
                            key, null, targetHost, targetPort, null, null, cb
                        );
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-accountAndProfile-modifyProfile', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            console.log(`${process.env.i} | modifyProfile @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }
        function getPublicProfile(){
            let callbackFn = err => {
                if(err){
                    callback(err);
                } else {
                    callback(null, from, to);
                }
            };

            let onRequest = (n, getProxy, postProxy, cb) => {
                let cbfn = (err, key) => {
                    if(err){
                        cb(err);
                    } else {
                        getProxy(`/profile.getPublicProfile?hid=${n + 1}`, key, null, targetHost, targetPort, null, null, cb);
                    }
                };

                redisShare.getShare('unicorns', n + 1, cbfn);
            };
            let onResponse = (n, statusCode, body, result, cb) => {
                measureBase.pushPreparedSample('builtin-accountAndProfile-getPublicProfile', n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb)
            };

            console.log(`${process.env.i} | getPublicProfile @ runActs @ beginBenchmark @ accountAndProfile.js...`);
            benchSingleActBase.go(from, to, bulkSize, onRequest, onResponse, callbackFn);
        }

        getAccount1();
    }

    lockBefore();
}