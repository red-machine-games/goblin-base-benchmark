'use strict';

module.exports = {
    getBenchDone
};

var _ = require('lodash'),
    async = require('async'),
    path = require('path'),
    lockfile = require('lockfile'),
    fse = require('fs-extra'),
    jsonfile = require('jsonfile');

const LOCKFILE_NAME = 'Q5PBNKx4kzVpEEXvw79qQbYN',
    FOLDER = '_benchmarkResults_/';

var redisConnection = require('./operativeSubsystem/redisConnection.js'),
    dataAnalysis = require('./dataAnalysis.js'),
    measureBase = require('./measureBase.js');

function getBenchDone(benchmarkName, procCount){
    var procNumber, theMeasurements, results;

    function rollCall(){
        let callbackFn = (err, response) => {
            if(err){
                glog.info(`rollCall @ getBenchDone @ benchSubmitter.js... ERROR`);
                glog.error(err);
                process.exit(-1);
            } else {
                let [_procNumber, rc] = response.split(';');
                if(!procNumber){
                    procNumber = _procNumber;
                }
                if(rc === '1'){
                    glog.info(`rollCall @ getBenchDone @ benchSubmitter.js... OK procNumber=${procNumber}`);
                    getMeasurements();
                } else {
                    setTimeout(rollCall, 500);
                }
            }
        };

        glog.info(`rollCall @ getBenchDone @ benchSubmitter.js... procCount=${procCount}`);
        var leArgs = [procCount];
        if(procNumber){
            leArgs.push(procNumber);
        }
        redisConnection.getTheClient().lockAndRollCall(leArgs, callbackFn);
    }
    function getMeasurements(){
        let callbackFn = (err, response) => {
            if(err){
                glog.info(`getMeasurements @ getBenchDone @ benchSubmitter.js... ERROR`);
                glog.error(err);
                process.exit(-1);
            } else if(response === '777'){
                glog.info(`getMeasurements @ getBenchDone @ benchSubmitter.js... OK`);
                if(theMeasurements){
                    parseMeasurements();
                } else {
                    getTheResult();
                }
            } else if(response === '-1'){
                if(theMeasurements){
                    getMeasurements();
                } else {
                    setTimeout(getMeasurements, 500);
                }
            } else if(response.startsWith('1;')){
                let keysAndMsrs = response.slice(2).split('|');
                _.each(keysAndMsrs, kam => {
                    var [msrKey, msr] = kam.split('==');
                    if(msr !== '-1'){
                        msr = msr.split('/').map(e => e.split('=')).slice(0, -1);
                        msrKey = msrKey.slice(4);
                        if(!theMeasurements){
                            theMeasurements = {};
                        }
                        if(!theMeasurements[msrKey]){
                            theMeasurements[msrKey] = {};
                        }
                        _.each(msr, it => theMeasurements[msrKey][it[0]] = it[1]);
                    }
                });

                getMeasurements();
            }
        };

        glog.info(`getMeasurements @ getBenchDone @ benchSubmitter.js...`);
        redisConnection.getTheClient().getMeasurements([procNumber], callbackFn);
    }
    function parseMeasurements(){
        glog.info(`parseMeasurements @ getBenchDone @ benchSubmitter.js...`);
        var toAnalyse = {};

        _.each(theMeasurements, (r, head) => {
            toAnalyse[head] = [];
            _.each(r, v => {
                v = v.split(';').map(e => e.split(':'));
                var toPush = {};
                _.each(v, metric => {
                    if(metric[0] === 'err'){
                        toPush.error = (metric[1] === '1');
                    } else if(metric[0] === 'code'){
                        toPush.code = +metric[1];
                    } else if(metric[0] === 'durs'){
                        toPush.start = +metric[1];
                    } else if(metric[0] === 'durd'){
                        toPush.done = +metric[1];
                    } else if(metric[0] === 'dur'){
                        toPush.timeSpent = +metric[1];
                    } else if(metric[0] === 'bt'){
                        toPush.benchmark = measureBase.returnBackBenchmarkTimingSample(metric[1]);
                    } else if(metric[0] === 'xdur'){
                        toPush.xduration = +metric[1];
                    }
                });
                toAnalyse[head].push(toPush);
            });
        });

        results = [];
        _.each(toAnalyse, (v, head) => results.push(dataAnalysis._appendBriefInfo(v, head, false, false)));

        glog.info(`parseMeasurements @ getBenchDone @ benchSubmitter.js... OK`);
        pushResultsToOp();
    }
    function pushResultsToOp(){
        let callbackFn = err => {
            if(err){
                glog.info(`pushResultsToOp @ getBenchDone @ benchSubmitter.js... ERROR`);
                glog.error(err);
                process.exit(-1);
            } else {
                glog.info(`pushResultsToOp @ getBenchDone @ benchSubmitter.js... OK`);
                persistResults();
            }
        };

        glog.info(`pushResultsToOp @ getBenchDone @ benchSubmitter.js...`);
        redisConnection.getTheClient().getRedis().set('measurement_results', JSON.stringify(results), callbackFn);
    }
    function getTheResult(){
        let callbackFn = (err, response) => {
            if(err){
                glog.info(`getTheResult @ getBenchDone @ benchSubmitter.js... ERROR`);
                glog.error(err);
                process.exit(-1);
            } else if(response){
                glog.info(`getTheResult @ getBenchDone @ benchSubmitter.js... OK`);
                results = JSON.parse(response);
                persistResults();
            } else {
                setTimeout(getTheResult, 500);
            }
        };

        glog.info(`getTheResult @ getBenchDone @ benchSubmitter.js...`);
        redisConnection.getTheClient().getRedis().get('measurement_results', callbackFn);
    }
    function persistResults(){
        function ensureResultsDir() {
            let callbackFn = err => {
                if(err){
                    glog.info(`ensureResultsDir @ persistResults @ getBenchDone @ benchSubmitter.js... ERROR`);
                    glog.error(err);
                    process.exit(-1);
                } else {
                    glog.info(`ensureResultsDir @ persistResults @ getBenchDone @ benchSubmitter.js... OK`);
                    lockLocal();
                }
            };

            glog.info(`ensureResultsDir @ persistResults @ getBenchDone @ benchSubmitter.js...`);
            fse.ensureDir(FOLDER, callbackFn);
        }
        function lockLocal(){
            let callbackFn = err => {
                if(err){
                    glog.info(`lockLocal @ persistResults @ getBenchDone @ benchSubmitter.js... ERROR`);
                    glog.error(err);
                    process.exit(-1);
                } else {
                    glog.info(`lockLocal @ persistResults @ getBenchDone @ benchSubmitter.js... OK`);
                    checkTheResultsFiles();
                }
            };

            glog.info(`lockLocal @ persistResults @ getBenchDone @ benchSubmitter.js...`);
            lockfile.lock(LOCKFILE_NAME, callbackFn);
        }
        function checkTheResultsFiles(){
            let callbackFn = (err, resp) => {
                if(err){
                    glog.info(`checkTheResultsFiles @ persistResults @ getBenchDone @ benchSubmitter.js... ERROR`);
                    glog.error(err);
                    process.exit(-1);
                } else if(resp.every(e => !e)){
                    glog.info(`checkTheResultsFiles @ persistResults @ getBenchDone @ benchSubmitter.js... OK 1`);
                    doPersist();
                } else {
                    glog.info(`checkTheResultsFiles @ persistResults @ getBenchDone @ benchSubmitter.js... OK 2`);
                    unlockLocal();
                }
            };

            glog.info(`checkTheResultsFiles @ persistResults @ getBenchDone @ benchSubmitter.js...`);
            async.parallel(results.map(e => cb => fse.pathExists(`${FOLDER}${benchmarkName}-${e.fileName}.json`, cb)), callbackFn);
        }
        function doPersist(){
            let callbackFn = err => {
                if(err){
                    glog.info(`doPersist @ persistResults @ getBenchDone @ benchSubmitter.js... ERROR`);
                    glog.error(err);
                    process.exit(-1);
                } else {
                    glog.info(`doPersist @ persistResults @ getBenchDone @ benchSubmitter.js... OK`);
                    unlockLocal();
                }
            };

            glog.info(`doPersist @ persistResults @ getBenchDone @ benchSubmitter.js...`);
            async.parallel(
                results.map(e => cb =>
                    jsonfile.writeFile(
                        path.join(process.cwd(), `${FOLDER}${benchmarkName}-${e.fileName}.json`),
                        e, { spaces: 4 }, cb
                    )
                ),
                callbackFn
            );
        }
        function unlockLocal(){
            let callbackFn = err => {
                if(err){
                    glog.info(`unlockLocal @ persistResults @ getBenchDone @ benchSubmitter.js... ERROR`);
                    glog.error(err);
                    process.exit(-1);
                } else {
                    glog.info(`unlockLocal @ persistResults @ getBenchDone @ benchSubmitter.js... OK`);
                    glog.info(`Work is done for #${procNumber}!`);
                    process.exit(0);
                }
            };

            glog.info(`unlockLocal @ persistResults @ getBenchDone @ benchSubmitter.js...`);
            lockfile.unlock(LOCKFILE_NAME, callbackFn);
        }

        ensureResultsDir();
    }

    rollCall();
}