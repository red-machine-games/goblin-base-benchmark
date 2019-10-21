'use strict';

module.exports = {
    doConnect,
    getTheClient: () => theRedisClient,
    getTheListener: () => theRedisListener
};

var _ = require('lodash'),
    async = require('async');

var redisUtils = require('./utils/redisUtils.js');

var theRedisClient, theRedisListener;

function doConnect(host, port, auth, callback){
    var redis = require('redis'), scripts = {};

    function _retards(script, keys, callback) {
        var args = [script];
        if (keys) {
            args.push(keys.length);
            args = args.concat(keys);
        } else {
            args.push(0);
        }
        args.push(callback);
        return this.eval.apply(this, args);
    }
    function _retardsSha(scriptSha, keys, callback) {
        var args = [scriptSha];
        if (keys) {
            args.push(keys.length);
            args = args.concat(keys);
        } else {
            args.push(0);
        }
        args.push(callback);
        return this.evalsha.apply(this, args);
    }
    function _fabricateOperativeClient(redisInstance){
        var out = {};

        _.each(scripts, (v, k) => {
            out[k] = (keys, callback) => redisUtils.callScript(redisInstance, v, keys, callback);
        });
        out.getRedis = () => redisInstance;

        return out;
    }

    function generateScripts(){
        var crypto = require('crypto'),
            fs = require('fs'),
            path = require('path');

        var folderPath = path.join(__dirname, 'lua'),
            filenames = fs.readdirSync(folderPath).filter(e => e.endsWith('.lua'));

        for(let i = 0 ; i < filenames.length ; i++){
            let fileContent = fs.readFileSync(path.join(folderPath, filenames[i]), 'utf-8'),
                scriptName = path.basename(filenames[i]).replace('.lua', ''),
                sha1 = crypto.createHash('sha1').update(Buffer.from(fileContent), 'binary').digest('hex');
            scripts[scriptName] = { sha: sha1, script: fileContent };
        }

        initClient();
    }
    function initClient(){
        const OPTIONS = { host, port, password: auth, retry_strategy: () => 1000, db: 15 };

        let callbackFn = err => {
            if(err){
                glog.error(err);
                process.exit(-1);
            } else {
                [theRedisClient, theRedisListener] = [_fabricateOperativeClient(client), _fabricateOperativeClient(listenerClient)];
                flushDb();
            }
        };

        var [client, listenerClient] = [redis.createClient(OPTIONS), redis.createClient(OPTIONS)];

        client.evalWithArray = listenerClient.evalWithArray = _retards;
        client.evalshaWithArray = listenerClient.evalshaWithArray = _retardsSha;

        async.parallel([client, listenerClient].map(c => cb => {
            var firstTimeConnecting = true;
            c.on('ready', () => {
                if(firstTimeConnecting){
                    firstTimeConnecting = false;
                    cb();
                }
                glog.info(`Benchmark Redis is ready`);
            });
            c.on('connect', () => glog.info(`Benchmark Redis is connected`));
            c.on('reconnecting', () => glog.info(`Benchmark Redis is reconnecting...`));
            c.on('error', err => {
                glog.error(`Error on connect to Benchmark Redis`);
                if(firstTimeConnecting){
                    firstTimeConnecting = false;
                    cb(err);
                }
            });
        }), callbackFn);
    }
    function flushDb(){
        let callbackFn = err => {
            if(err){
                glog.error(err);
                process.exit(-1);
            } else {
                callback();
            }
        };

        theRedisClient.getRedis().flushdb(callbackFn);
    }

    generateScripts();
}