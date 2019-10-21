'use strict';

module.exports = {
    injectHmacSecret,
    injectPlatformAndVersion,
    injectUriPrefix,
    setProtocol,

    getProxy,
    postProxy
};

var _ = require('lodash'),
    request = require('request'),
    crypto = require('crypto'),
    urlJoin = require('url-join');

var redisShare = require('./operativeSubsystem/redisShare.js');

var hmacSecret, platformAndVersion, uriPrefix,
    protocol = 'http';

function injectHmacSecret(_hmacSecret){
    hmacSecret = _hmacSecret;
}
function injectPlatformAndVersion(_platformAndVersion){
    platformAndVersion = _platformAndVersion;
}
function injectUriPrefix(_uriPrefix){
    uriPrefix = _uriPrefix;
}
function setProtocol(_useHttps){
    protocol = _useHttps ? 'https' : 'http';
}

function getProxy(uri, unicorn, bookingKey, host, port, overridePrefix, theHeaders, callback){
    var targetAddress = `${host}:${port}`, reqSeq,
        unicornOrBookingKey = unicorn || bookingKey,
        reqSeqKey = `${targetAddress}:${unicornOrBookingKey}`;

    function getTheReqSeq(){
        if(unicornOrBookingKey){
            let callbackFn = (err, rs) => {
                if(err){
                    callback(err);
                } else {
                    reqSeq = +rs;
                    doTheJob();
                }
            };

            redisShare.incrementAndGetShare('reqseq', reqSeqKey, callbackFn);
        } else {
            reqSeq = 0;
            doTheJob();
        }
    }
    function doTheJob(){
        uri = urlJoin(overridePrefix == null ? uriPrefix : overridePrefix, uri);
        var headers = (theHeaders && _.isPlainObject(theHeaders)) ? theHeaders : {};

        if(hmacSecret && platformAndVersion){
            let sign = `${uri}${reqSeq}${unicornOrBookingKey ? unicornOrBookingKey : ''}${hmacSecret}`;
            headers['X-Platform-Version'] = platformAndVersion;
            headers['X-Request-Sign'] = crypto.createHash('sha256').update(Buffer.from(sign), 'binary').digest('hex');
            headers['X-Req-Seq'] = reqSeq;
        }

        if(unicorn){
            headers['X-Unicorn'] = unicorn;
        } else {
            headers['X-Book-Key'] = bookingKey;
        }

        var onRequestTs = _.now();
        request.get(
            { url: urlJoin(`${protocol}://${targetAddress}`, uri), headers },
            (err, resp, body) => {if(err)console.error(err); callback(err, resp, body, onRequestTs);}
        );
    }

    getTheReqSeq();
}
function postProxy(uri, body, unicorn, bookingKey, host, port, overridePrefix, theHeaders, callback){
    var targetAddress = `${host}:${port}`, reqSeq,
        unicornOrBookingKey = unicorn || bookingKey,
        reqSeqKey = `${targetAddress}:${unicornOrBookingKey}`;

    function getTheReqSeq(){
        if(unicornOrBookingKey){
            let callbackFn = (err, rs) => {
                if(err){
                    callback(err);
                } else {
                    reqSeq = +rs;
                    doTheJob();
                }
            };

            redisShare.incrementAndGetShare('reqseq', reqSeqKey, callbackFn);
        } else {
            reqSeq = 0;
            doTheJob();
        }
    }
    function doTheJob(){
        uri = urlJoin(overridePrefix == null ? uriPrefix : overridePrefix, uri);
        var headers = (theHeaders && _.isPlainObject(theHeaders)) ? theHeaders : {};

        if(hmacSecret && platformAndVersion){
            let sign = `${uri}${body ? JSON.stringify(body) : ''}${reqSeq}${unicornOrBookingKey ? unicornOrBookingKey : ''}${hmacSecret}`;
            headers['X-Platform-Version'] = platformAndVersion;
            headers['X-Request-Sign'] = crypto.createHash('sha256').update(Buffer.from(sign), 'binary').digest('hex');
            headers['X-Req-Seq'] = reqSeq;
        }

        if(unicorn){
            headers['X-Unicorn'] = unicorn;
        } else {
            headers['X-Book-Key'] = bookingKey;
        }

        var onRequestTs = _.now();
        request.post(
            { url: urlJoin(`${protocol}://${targetAddress}`, uri), json: body, headers },
            (err, resp, body) => {if(err)console.error(err); callback(err, resp, body, onRequestTs);}
        );
    }

    getTheReqSeq();
}