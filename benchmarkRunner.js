'use strict';

module.exports = {
    doRun
};

var _ = require('lodash'),
    crypto = require('crypto'),
    buildUrl = require('build-url');

var redisShare = require('./lib/operativeSubsystem/redisShare.js'),
    redisLocker = require('./lib/operativeSubsystem/redisLocker.js'),
    accountAndProfile = require('./goblinBaseBuiltinScenarios/accountAndProfile.js'),
    records = require('./goblinBaseBuiltinScenarios/records.js'),
    benchSingleActBase = require('./lib/benchSingleActBase.js'),
    benchWebsocketActBase = require('./lib/benchWebsocketActBase.js'),
    measureBase = require('./lib/measureBase.js');

var websocketMessageLL = new Set(),
    websocketCloseLL = new Set(),
    websocketDefaultMessageLL = new Map();

benchWebsocketActBase.hangOnMessageListener((consHead, n, message) => {
    websocketMessageLL.forEach(lst => lst(consHead, n, message));
    return !!websocketMessageLL.length;
});

benchWebsocketActBase.hangOnCloseListener((consHead, domainN, code, endMessage, allAreDone) => {
    websocketCloseLL.forEach(lst => lst(consHead, domainN, code, endMessage, allAreDone));
    return !!websocketCloseLL.length;
});

benchWebsocketActBase.hangDefaultOnMessageListener((consHead, n, message) => {
    if(websocketDefaultMessageLL.has(consHead)){
        websocketDefaultMessageLL.get(consHead)(n, message);
    }
});

function doRun(bulkSize, onHost, onPort, pathToBenchmarkScenario, peersCount, procCount){
    var benchmarkName = require('path').basename(pathToBenchmarkScenario).split('.js').join(''),
        workloadNs = [],
        workloadsFromTo;

    const BUILTIN = {
        async accountAndProfile(){
            var resolve, reject;

            function doAccountAndProfile(){
                let callbackFn = (err, from, to) => {
                    if(err){
                        reject(err);
                    } else {
                        workloadsFromTo = [from, to];
                        _(to - from).times(n => workloadNs.push(from + n + 1));
                        resolve();
                    }
                };

                accountAndProfile.beginBenchmark(onHost, onPort, bulkSize, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                if(!PREFS.GOBLIN_BASE_HMAC_SECRET || !PREFS.GOBLIN_BASE_PLATFORM_VERSION){
                    _reject(new Error('No appropriate prefs to test Goblin Base (GOBLIN_BASE_HMAC_SECRET and GOBLIN_BASE_PLATFORM_VERSION)'))
                } else if(_.isEmpty(workloadNs)){
                    resolve = _resolve;
                    reject = _reject;
                    doAccountAndProfile();
                } else {
                    _reject(new Error('This benchmark can be run only once'))
                }
            });
        },
        async records(){
            var resolve, reject;

            function doRecords(){
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve();
                    }
                };

                records.beginBenchmark(onHost, onPort, bulkSize, workloadsFromTo, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                if(!PREFS.GOBLIN_BASE_HMAC_SECRET || !PREFS.GOBLIN_BASE_PLATFORM_VERSION){
                    _reject(new Error('No appropriate prefs to test Goblin Base (GOBLIN_BASE_HMAC_SECRET and GOBLIN_BASE_PLATFORM_VERSION)'))
                } else {
                    resolve = _resolve;
                    reject = _reject;
                    doRecords();
                }
            });
        }
    };

    class TheHttpBench{
        constructor(method, head, uri, overrideTargetHost, overrideTargetPort, overridePrefix, noUnicorn){
            this.method = method;
            this.head = head;
            this.uri = uri;
            this.overrideTargetHost = overrideTargetHost;
            this.overrideTargetPort = overrideTargetPort;
            this.overridePrefix = overridePrefix;
            this.noUnicorn = noUnicorn;
            this.alreadyDone = false;
        }
        getDone(onRequest, overrideAddressLambda){
            if(this.alreadyDone){
                throw new Error('This benchmark is already done!');
            } else {
                this.alreadyDone = true;
            }

            var head = this.head, method = this.method, uri = this.uri, overrideTargetHost = this.overrideTargetHost,
                overrideTargetPort = this.overrideTargetPort, overridePrefix = this.overridePrefix, noUnicorn = this.noUnicorn,
                resolve, reject,
                from, to;

            function lockBefore(){
                let callbackFn = (err, workDistribution) => {
                    if (err) {
                        callback(err);
                    } else {
                        [from, to] = workloadsFromTo ? workloadsFromTo : [workDistribution[0], workDistribution[1]];
                        doGetDone();
                    }
                };

                redisLocker.lockInProcess(head, callbackFn);
            }
            function doGetDone(){
                var outputResult = [];

                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(outputResult);
                    }
                };

                let onResponse = (n, statusCode, body, result, cb) => {
                    outputResult.push({ statusCode, body, n });
                    measureBase.pushPreparedSample(head, n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb);
                };

                benchSingleActBase.go(from, to, bulkSize, onRequestBase, onResponse, callbackFn);
            }
            function onRequestBase(n, getProxy, postProxy, cb){
                var query, body, headers, bookingKey, unicorn;

                function syncOnRequest(){
                    try{
                        let _stuff = onRequest(n);
                        if(_.isPlainObject(_stuff)){
                            query = _stuff.query;
                            body = _stuff.body;
                            headers = _stuff.headers;
                            bookingKey = _stuff.bookingKey;
                        } else {
                            return cb(null);
                        }
                    } catch(err){
                        return cb(err);
                    }
                    getUnicorn();
                }
                function asyncOnRequest(){
                    onRequest(n)
                        .then(_stuff => {
                            if(_.isPlainObject(_stuff)){
                                query = _stuff.query;
                                body = _stuff.body;
                                headers = _stuff.headers;
                                bookingKey = _stuff.bookingKey;
                            } else {
                                return cb(null);
                            }
                            getUnicorn();
                        })
                        .catch(err => cb(err));
                }
                function getUnicorn(){
                    if(!noUnicorn && PREFS.GOBLIN_BASE_HMAC_SECRET && PREFS.GOBLIN_BASE_PLATFORM_VERSION){
                        let callbackFn = (err, key) => {
                            if(err){
                                cb(err);
                            } else {
                                unicorn = key;
                                doOverrideAddressLambda();
                            }
                        };

                        redisShare.getShare('unicorns', n + 1, callbackFn);
                    } else {
                        doOverrideAddressLambda();
                    }
                }
                function doOverrideAddressLambda(){
                    if(overrideAddressLambda){
                        if(_.isAsyncFunction(overrideAddressLambda)){
                            overrideAddressLambda(n)
                                .then(_overrideTarget => {
                                    if(_overrideTarget && _overrideTarget[0]){
                                        overrideTargetHost = _overrideTarget[0];
                                    }
                                    if(_overrideTarget && _overrideTarget[1]){
                                        overrideTargetPort = _overrideTarget[1];
                                    }
                                    doTheRequest();
                                })
                                .catch(err => cb(err));
                        } else {
                            let _overrideTargetHost, _overrideTargetPort;
                            try{
                                [_overrideTargetHost, _overrideTargetPort] = overrideAddressLambda(n);
                            } catch(err){
                                return cb(err);
                            }
                            if(_overrideTargetHost){
                                overrideTargetHost = _overrideTargetHost;
                            }
                            if(_overrideTargetPort){
                                overrideTargetPort = _overrideTargetPort;
                            }
                            doTheRequest();
                        }
                    } else {
                        doTheRequest();
                    }
                }
                function doTheRequest(){
                    if(method && method.toLowerCase() === 'post'){
                        postProxy(
                            `${uri}${query ? buildUrl('', { queryParams: query }) : ''}`, body,
                            bookingKey ? null : unicorn, bookingKey, overrideTargetHost || onHost,
                            overrideTargetPort || onPort, overridePrefix, headers,
                            cb
                        )
                    } else {
                        getProxy(
                            `${uri}${query ? buildUrl('', { queryParams: query }) : ''}`,
                            bookingKey ? null : unicorn, bookingKey, overrideTargetHost || onHost,
                            overrideTargetPort || onPort, overridePrefix, headers,
                            cb
                        );
                    }
                }

                if(onRequest){
                    if(_.isAsyncFunction(onRequest)){
                        asyncOnRequest();
                    } else {
                        syncOnRequest();
                    }
                } else {
                    getUnicorn();
                }
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                lockBefore();
            });
        }
    }
    class TheWsBench{
        constructor(head, uri, overrideTargetHost, overrideTargetPort, overridePrefix){
            this.head = head;
            this.uri = uri;
            this.overrideTargetHost = overrideTargetHost;
            this.overrideTargetPort = overrideTargetPort;
            this.overridePrefix = overridePrefix;
        }
        wsConnect(auxHead, queryLambda, overrideAddressLambda, defaultOnMessageListener){
            if(!this.head || !queryLambda){
                throw new Error('Connection head and query lambda are the must');
            } else if(benchWebsocketActBase.checkConsPresenceWithHead(this.head)){
                throw new Error('This head is busy');
            }

            var head = `${this.head}${auxHead ? `-${auxHead}` : ''}`, originalHead = this.head, uriG = this.uri,
                overridePrefix = this.overridePrefix, overrideTargetHostG = this.overrideTargetHost,
                overrideTargetPortG = this.overrideTargetPort,
                resolve, reject,
                from, to;

            function lockBefore(){
                let callbackFn = (err, workDistribution) => {
                    if (err) {
                        reject(err);
                    } else {
                        [from, to] = workloadsFromTo ? workloadsFromTo : [workDistribution[0], workDistribution[1]];
                        doGoConnect();
                    }
                };

                redisLocker.lockInProcess(head, callbackFn);
            }
            function doGoConnect() {
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(new WsBenchApi(originalHead));
                    }
                };

                let onResponse = (n, result, cb) =>
                    measureBase.pushPreparedSample(head, n, result.error, result.code || 0, result.start, result.done, null, result.benchmark, result.xduration, cb);

                if(defaultOnMessageListener){
                    websocketDefaultMessageLL.set(originalHead, defaultOnMessageListener);
                }
                benchWebsocketActBase.goConnect(originalHead, from, to, bulkSize, _onRequestBase, onResponse, callbackFn);
            }
            function _onRequestBase(n, cb){
                var overrideTargetHost = overrideTargetHostG, overrideTargetPort = overrideTargetPortG,
                    query;

                function getTheHostAndPort(){
                    if(overrideAddressLambda){
                        if(_.isAsyncFunction(overrideAddressLambda)){
                            overrideAddressLambda(n)
                                .then(_overrideTarget => {
                                    if(_overrideTarget && _overrideTarget[0]){
                                        overrideTargetHost = _overrideTarget[0];
                                    }
                                    if(_overrideTarget && _overrideTarget[1]){
                                        overrideTargetPort = _overrideTarget[1];
                                    }
                                    getTheQuery();
                                })
                                .catch(err => cb(err));
                        } else {
                            let _overrideTargetHost, _overrideTargetPort;
                            try{
                                [_overrideTargetHost, _overrideTargetPort] = overrideAddressLambda(n);
                            } catch(err){
                                return cb(err);
                            }
                            if(_overrideTargetHost){
                                overrideTargetHost = _overrideTargetHost;
                            }
                            if(_overrideTargetPort){
                                overrideTargetPort = _overrideTargetPort;
                            }
                            getTheQuery();
                        }
                    } else {
                        getTheQuery();
                    }
                }
                function getTheQuery(){
                    if(_.isAsyncFunction(queryLambda)){
                        queryLambda(n)
                            .then(_query => {
                                query = _query;
                                makeAnUrl();
                            })
                            .catch(err => cb(err));
                    } else {
                        try{
                            query = queryLambda(n);
                        } catch(err){
                            return cb(err);
                        }
                        makeAnUrl();
                    }
                }
                function makeAnUrl(){
                    var uri = `${overridePrefix}${uriG}${query ? buildUrl('', { queryParams: query }) : ''}`;
                    cb(null, `ws${PREFS.USE_WSS ? 's' : ''}://${overrideTargetHost || onHost}:${overrideTargetPort || onPort}${uri}`);
                }

                getTheHostAndPort();
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                lockBefore();
            });
        }
    }
    class WsBenchApi{
        constructor(head){
            this.head = head;
            this.messagesCounter = 0;
            this._internalOnMessage = (consHead, domainN, message) => {
                if(consHead === this.head && this._internalOnMessageCallback){
                    this._internalOnMessageCallback(domainN, message);
                }
            };
            this._internalOnClose = (consHead, domainN, code, endMessage, allAreDone) => {
                if(consHead === this.head){
                    if(this._internalOnCloseCallback){
                        if(_.isAsyncFunction(this._internalOnCloseCallback)){
                            this._internalOnCloseCallback(domainN, code, endMessage)
                                .then(() => _checkAllAreDone(allAreDone))
                                .catch(err => console.error(err));
                        } else {
                            this._internalOnCloseCallback(domainN, code, endMessage);
                            _checkAllAreDone(allAreDone);
                        }
                    } else {
                        _checkAllAreDone(allAreDone);
                    }
                }
            };
            var _checkAllAreDone = _allAreDone => {
                if(_allAreDone){
                    websocketMessageLL.delete(this._internalOnMessage);
                    websocketCloseLL.delete(this._internalOnClose);
                    this._internalOnMessageCallback = null;
                    this._internalOnCloseCallback = null;
                }
            };

            websocketMessageLL.add(this._internalOnMessage);
            websocketCloseLL.add(this._internalOnClose);
        }
        onMessage(onMessageCallback){
            if(!benchWebsocketActBase.checkConsPresenceWithHead(this.head)){
                throw new Error('Suddenly no more such websockets open');
            }
            this._internalOnMessageCallback = onMessageCallback;
        }
        onClose(onCloseCallback){
            if(!benchWebsocketActBase.checkConsPresenceWithHead(this.head)){
                throw new Error('Suddenly no more such websockets open');
            }
            this._internalOnCloseCallback = onCloseCallback;
        }
        sendMessages(messageLambda, noLockingBefore, isDirect){
            if(!messageLambda){
                throw new Error('Message lambda is the must the must');
            } else if(!benchWebsocketActBase.checkConsPresenceWithHead(this.head)){
                throw new Error('Suddenly no more such websockets open');
            } else {
                this.messagesCounter++;
            }

            var head = this.head, messagesCounter = this.messagesCounter,
                resolve, reject,
                from, to;

            function lockBefore(){
                if(!noLockingBefore || !workloadsFromTo){
                    let callbackFn = (err, workDistribution) => {
                        if (err) {
                            callback(err);
                        } else {
                            [from, to] = workloadsFromTo ? workloadsFromTo : [workDistribution[0], workDistribution[1]];
                            doSendMessages();
                        }
                    };

                    redisLocker.lockInProcess(`${head}-message-${messagesCounter}`, callbackFn);
                } else {
                    [from, to] = workloadsFromTo;
                    doSendMessages();
                }
            }
            function doSendMessages(){
                var howMuchMessagesSent = 0;

                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(howMuchMessagesSent);
                    }
                };

                let onResponse = (n, cb) => {
                    howMuchMessagesSent++;
                    cb();
                };

                benchWebsocketActBase.goMessage(head, from, to, bulkSize, _onRequestBase, onResponse, callbackFn);
            }
            function _onRequestBase(n, callback){
                var theMessage, theBookingKey, theSequence;

                function getDaStuff(){
                    if(_.isAsyncFunction(messageLambda)){
                        messageLambda(n)
                            .then(theMessageAndOrBookingKey => {
                                if(_.isPlainObject(theMessageAndOrBookingKey) && theMessageAndOrBookingKey.message){
                                    theMessage = theMessageAndOrBookingKey.message;
                                    theBookingKey = theMessageAndOrBookingKey.bookingKey;
                                    tryGoblinBaseGameplayRoom();
                                } else {
                                    callback(null);
                                }
                            })
                            .catch(err => callback(err));
                    } else {
                        let theMessageAndOrBookingKey;
                        try{
                            theMessageAndOrBookingKey = messageLambda(n);
                        } catch(err){
                            return callback(err);
                        }
                        if(_.isPlainObject(theMessageAndOrBookingKey) && theMessageAndOrBookingKey.message){
                            theMessage = theMessageAndOrBookingKey.message;
                            theBookingKey = theMessageAndOrBookingKey.bookingKey;
                            tryGoblinBaseGameplayRoom();
                        } else {
                            callback(null);
                        }
                    }
                }
                function tryGoblinBaseGameplayRoom(){
                    if(PREFS.GOBLIN_BASE_HMAC_SECRET && PREFS.GOBLIN_BASE_PLATFORM_VERSION){
                        if(theBookingKey){
                            getDaSequence();
                        } else {
                            callback(null, theMessage);
                        }
                    } else {
                        callback(null, theMessage);
                    }
                }
                function getDaSequence(){
                    if(!isDirect){
                        let callbackFn = (err, seq) => {
                            if(err){
                                callback(err);
                            } else {
                                theSequence = +seq;
                                buildGoblinBaseMessage();
                            }
                        };

                        redisShare.incrementAndGetShare(`ws-seq-${head}`, theBookingKey, callbackFn);
                    } else {
                        callback(null, theMessage);
                    }
                }
                function buildGoblinBaseMessage(){
                    theMessage = { mysq: theSequence, m: _.isObject(theMessage) ? theMessage : JSON.parse(theMessage) };
                    let sign = `/${JSON.stringify(theMessage)}${theBookingKey}${PREFS.GOBLIN_BASE_HMAC_SECRET}`;
                    theMessage.sign = crypto.createHash('sha256').update(Buffer.from(sign), 'binary').digest('hex');
                    callback(null, theMessage);
                }

                getDaStuff();
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                lockBefore();
            });
        }
        closeConnections(beforeCloseLambda){
            if(!benchWebsocketActBase.checkConsPresenceWithHead(this.head)){
                throw new Error('Suddenly no more such websockets open');
            }
            websocketMessageLL.delete(this._internalOnMessage);
            websocketCloseLL.delete(this._internalOnClose);

            this._internalOnMessageCallback = null;
            this._internalOnCloseCallback = null;

            var head = this.head,
                resolve, reject,
                from, to;

            function lockBefore(){
                let callbackFn = (err, workDistribution) => {
                    if (err) {
                        callback(err);
                    } else {
                        [from, to] = workloadsFromTo ? workloadsFromTo : [workDistribution[0], workDistribution[1]];
                        doCloseConnections();
                    }
                };

                redisLocker.lockInProcess(head, callbackFn);
            }
            function doCloseConnections(){
                var howMuchConnectionsClosed = 0;

                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        redisShare.unshareMany(`ws-seq-${head}`, err => {
                            if(err){
                                reject(err);
                            } else {
                                resolve(howMuchConnectionsClosed);
                            }
                        });
                    }
                };

                let onRequestBase = (n, cb) => {
                    if(_.isAsyncFunction(beforeCloseLambda)){
                        beforeCloseLambda(n)
                            .then(() => cb(null))
                            .catch(err => cb(err));
                    } else {
                        cb(beforeCloseLambda(null));
                    }
                };
                let onResponse = (n, cb) => {
                    howMuchConnectionsClosed++;
                    cb();
                };

                benchWebsocketActBase.goClose(head, from, to, bulkSize, onRequestBase, onResponse, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                lockBefore();
            });
        }
        startMeasure(measureHead, n){
            var head = this.head,
                resolve, reject;

            function doStartMeasure(){
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve();
                    }
                };

                measureBase.startMeasure(`${head}-${measureHead}`, n, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doStartMeasure();
            });
        }
        stopMeasure(measureHead, n){
            var head = this.head,
                resolve, reject;

            function doStopMeasure(){
                let callbackFn = (err, theSample) => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(theSample);
                    }
                };

                measureBase.finishMeasure(`${head}-${measureHead}`, n, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doStopMeasure();
            });
        }
        pushMeasure(measureHead, n, measuredDuration){
            var head = this.head,
                resolve, reject;

            function doPushMeasure(){
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve();
                    }
                };

                measureBase.pushPreparedSample(`${head}-${measureHead}`, n, false, 200, null, null, measuredDuration, null, null, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doPushMeasure();
            });
        }
    }
    class TheBenchmark{
        constructor(){
            this.builtins = BUILTIN;
            this.peersCount = peersCount;
            this.platformAndVersion = PREFS.GOBLIN_BASE_PLATFORM_VERSION;
        }
        get Ns(){
            return workloadNs;
        }
        http(configs){
            var overrideTargetHost, overrideTargetPort;
            if(configs.overrideTarget){
                overrideTargetHost = configs.overrideTarget.host;
                overrideTargetPort = configs.overrideTarget.port;
            }
            return new TheHttpBench(
                configs.method || 'get', configs.head, configs.uri,
                overrideTargetHost, overrideTargetPort, configs.overridePrefix, configs.noUnicorn
            );
        }
        ws(configs){
            var overrideTargetHost, overrideTargetPort;
            if(configs.overrideTarget){
                overrideTargetHost = configs.overrideTarget.host;
                overrideTargetPort = configs.overrideTarget.port;
            }
            return new TheWsBench(configs.head, configs.uri, overrideTargetHost, overrideTargetPort, configs.overridePrefix);
        }
        bottleneck(uniqueHead){
            var resolve, reject;

            function doTheBottleneck(){
                let callbackFn = (err, workDistribution) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(workloadsFromTo ? workloadsFromTo : [workDistribution[0], workDistribution[1]]);
                    }
                };

                redisLocker.lockInProcess(`bn-${uniqueHead}`, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doTheBottleneck();
            });
        }
        shareValue(tabName, theKey, theValue){
            var resolve, reject;

            function doShareValue(){
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve();
                    }
                };

                redisShare.shareValue(tabName, theKey, theValue, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doShareValue();
            });
        }
        shareMany(tabName, keysAndValues){
            var resolve, reject;

            function doShareMany(){
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(err);
                    }
                };

                redisShare.shareMany(tabName, keysAndValues, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doShareMany();
            });
        }
        getShare(tabName, theKey){
            var resolve, reject;

            function doGetShare(){
                let callbackFn = (err, theValue) => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(theValue);
                    }
                };

                redisShare.getShare(tabName, theKey, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doGetShare();
            });
        }
        incrementAndGetShare(tabName, theKey){
            var resolve, reject;

            function doIncrementAndGetShare(){
                let callbackFn = (err, theValue) => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(theValue);
                    }
                };

                redisShare.incrementAndGetShare(tabName, theKey, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doIncrementAndGetShare();
            });
        }
        unshare(tabName, theKey){
            var resolve, reject;

            function doUnshare(){
                let callbackFn = (err, theValue) => {
                    if(err){
                        reject(err);
                    } else {
                        resolve(theValue);
                    }
                };

                redisShare.unshare(tabName, theKey, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doUnshare();
            });
        }
        listenShareEqualTo(tabName, theKey, preferableValue){
            var resolve, reject;

            function doTheListen(){
                let callbackFn = err => {
                    if(err){
                        reject(err);
                    } else {
                        resolve();
                    }
                };

                redisShare.listenShareEqualTo(tabName, theKey, preferableValue, callbackFn);
            }

            return new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
                doTheListen();
            });
        }
    }

    let callbackFn = err => {
        if(err){
            console.log(`${process.env.i} | doRun @ benchmarkRunner.js... ERROR`);
            console.error(err);
            process.exit(-1);
        } else {
            console.log(`${process.env.i} | doRun @ benchmarkRunner.js... OK`);
            require('./lib/benchSubmitter.js').getBenchDone(benchmarkName, procCount);
        }
    };

    var requestProxy = require('./lib/requestProxy.js'),
        laBench = require(pathToBenchmarkScenario);

    redisShare.init();
    if(PREFS.GOBLIN_BASE_HMAC_SECRET){
        requestProxy.injectHmacSecret(PREFS.GOBLIN_BASE_HMAC_SECRET);
    }
    if(PREFS.GOBLIN_BASE_PLATFORM_VERSION){
        requestProxy.injectPlatformAndVersion(PREFS.GOBLIN_BASE_PLATFORM_VERSION);
    }
    requestProxy.injectUriPrefix(PREFS.URI_PREFIX || '');
    requestProxy.setProtocol(PREFS.USE_HTTPS);

    console.log(`${process.env.i} | doRun @ benchmarkRunner.js...`);
    laBench(new TheBenchmark()).then(() => callbackFn()).catch(err => callbackFn(err));
}