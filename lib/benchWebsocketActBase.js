'use strict';

module.exports = {
    hangOnMessageListener,
    hangOnCloseListener,
    hangDefaultOnMessageListener,
    checkConsPresenceWithHead,
    injectHmacSecret,

    goConnect,
    goMessage,
    goClose
};

const RUNNER_MODE = 'bulk';

var _ = require('lodash'),
    WebSocket = require('ws');

var runner = require('./runners.js').runner;

var stayWebsocketsHere = {},
    onMessageListener, onCloseListener,
    defaultOnMessageListener,
    hmacSecret;

function hangOnMessageListener(_onMessageListener){
    onMessageListener = _onMessageListener;
}
function hangOnCloseListener(_onCloseListener){
    onCloseListener = _onCloseListener;
}
function hangDefaultOnMessageListener(_defaultOnMessageListener){
    defaultOnMessageListener = _defaultOnMessageListener;
}
function checkConsPresenceWithHead(consHead){
    return stayWebsocketsHere[consHead]
        && _.size(stayWebsocketsHere[consHead])
        && Object.values(stayWebsocketsHere[consHead]).map(e => e.sock).every(e => e.readyState === 1);
}
function injectHmacSecret(_hmacSecret){
    hmacSecret = _hmacSecret;
}

function goConnect(consHead, from, to, bulkSize, onRequest, onResponse, callback){
    var asyncJobs = [];

    _(to - from).times(n => {
        asyncJobs.push(cbfn => {
            var onRequestTs = _.now(),
                onRequestDoneTs, result, aWebsocket;

            let onRequestCallback = (err, aUrl) => {
                onRequestTs = _.now();

                if(err){
                    glog.error(err);
                    result = { error: true, start: onRequestTs, done: onRequestTs };
                    onResponse(n + from, result, cbfn);
                } else if(aUrl){
                    aWebsocket = new WebSocket(aUrl);
                    aWebsocket.on('error', err => aWebsocketCallback(err));
                    aWebsocket.on('open', aWebsocketCallback);
                    aWebsocket.on('close', (code, reason) =>
                        aWebsocketCallback(new Error(`closed with code: ${code} and reason: ${reason}`)));
                } else {
                    cbfn(null);
                }
            };
            let aWebsocketCallback = err => {
                onRequestDoneTs = _.now();
                aWebsocket.removeAllListeners('error');
                aWebsocket.removeAllListeners('open');
                aWebsocket.removeAllListeners('close');
                if(err){
                    glog.error(err);
                    result = { error: true, start: onRequestTs, done: onRequestDoneTs };
                    try{
                        aWebsocket.terminate();
                    } catch(err){}
                } else {
                    if(!stayWebsocketsHere[consHead]){
                        stayWebsocketsHere[consHead] = {};
                    }
                    stayWebsocketsHere[consHead][n] = { sock: aWebsocket, domainN: n + from };
                    result = { code: 200, start: onRequestTs, done: onRequestDoneTs };
                    aWebsocket.on('message', _onWebsocketMessage(consHead, from + n));
                    aWebsocket.on('error', err => glog.error(err));
                    aWebsocket.on('close', _onWebsocketClose(consHead, n, from + n, aWebsocket));
                }
                onResponse(n + from, result, cbfn);
            };

            onRequest(n + from, onRequestCallback);
        });
    });

    runner(RUNNER_MODE, bulkSize, asyncJobs, callback);
}
function goMessage(consHead, from, to, bulkSize, onRequest, onResponse, callback){
    var asyncJobs = [];

    _(to - from).times(n => {
        asyncJobs.push(cbfn => {
            if(stayWebsocketsHere[consHead]){
                try{
                    var [aWebsocket, domainN] = [stayWebsocketsHere[consHead][n].sock, stayWebsocketsHere[consHead][n].domainN];
                } catch(err){
                    glog.error(err);
                    let _shit = {};
                    _.each(stayWebsocketsHere, (v, k) => {
                        _shit[k] = {};
                        _.each(v, (v2, k2) => _shit[k][k2] = !!v2);
                    });
                }
            } else {
                return cbfn(new Error('No socket'));
            }

            let onRequestCallback = (err, aMessage) => {
                if(err){
                    cbfn(err);
                } else if(aMessage){
                    if(!aWebsocket || aWebsocket.readyState !== 1){
                        cbfn(new Error(`No target connection or socket has non-1 ready state (${aWebsocket.readyState})`));
                    } else {
                        aWebsocket.send(
                            _.isObject(aMessage) ? JSON.stringify(aMessage) : aMessage,
                            err => err ? cbfn(err) : onResponse(domainN, cbfn)
                        );
                    }
                } else {
                    cbfn(null);
                }
            };

            if(aWebsocket){
                onRequest(domainN, onRequestCallback);
            } else {
                cbfn(null);
            }
        });
    });

    runner(RUNNER_MODE, bulkSize, asyncJobs, callback);
}
function goClose(consHead, from, to, bulkSize, onRequest, onResponse, callback){
    var asyncJobs = [];

    _(to - from).times(n => {
        asyncJobs.push(cbfn => {
            var aWebsocket;
            if(stayWebsocketsHere[consHead]){
                aWebsocket = stayWebsocketsHere[consHead][n];
            }

            let onRequestCallback = err => {
                if(err){
                    cbfn(err);
                } else {
                    if(aWebsocket.readyState !== 1){
                        cbfn(new Error(`Socket has non-1 ready state (${aWebsocket.readyState})`));
                    } else {
                        aWebsocket.removeAllListeners('message');
                        aWebsocket.removeAllListeners('error');
                        aWebsocket.removeAllListeners('close');
                        delete stayWebsocketsHere[consHead][n];
                        if(!_.size(stayWebsocketsHere[consHead])){
                            delete stayWebsocketsHere[consHead];
                        }
                        aWebsocket.close(err => err ? cbfn(err) : onResponse(n + from, cbfn));
                    }
                }
            };

            if(aWebsocket){
                onRequest(n + from, onRequestCallback);
            } else {
                cbfn(null);
            }
        });
    });

    runner(RUNNER_MODE, bulkSize, asyncJobs, callback);
}

function _onWebsocketMessage(consHead, n){
    return message => {
        if(onMessageListener || defaultOnMessageListener){
            if(message && _.isString(message) && (message.startsWith('{') || message.startsWith('['))){
                try{
                    message = JSON.parse(message);
                } catch(err){}
            }
            let _sent;
            if(onMessageListener){
                _sent = onMessageListener(consHead, n, message);
            }
            if(!_sent && defaultOnMessageListener){
                defaultOnMessageListener(consHead, n, message);
            }
        }
    };
}
function _onWebsocketClose(consHead, enumerateN, domainN, theSocket){
    return (code, endMessage) => {
        if(code === 1006){
            glog.error(new Error(`Socket ended with code 1006: ${endMessage}`));
        }
        delete stayWebsocketsHere[consHead][enumerateN];
        var allAreDone = false;
        if(!_.size(stayWebsocketsHere[consHead])){
            delete stayWebsocketsHere[consHead];
            allAreDone = true;
        }
        theSocket.removeAllListeners('error');
        theSocket.removeAllListeners('open');
        theSocket.removeAllListeners('close');
        theSocket.removeAllListeners('message');
        if(onCloseListener){
            if(endMessage && _.isString(endMessage)){
                try{
                    endMessage = JSON.parse(endMessage);
                } catch(err){}
            }
            onCloseListener(consHead, domainN, code, endMessage, allAreDone);
        }
    }
}