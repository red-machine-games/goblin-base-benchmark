'use strict';

module.exports = {
    runner,
    runnerBulkButSeriesByPlayer
};

var _ = require('lodash'),
    async = require('async');

function runner(mode, peersBulkSize, jobs, callback){
    if(mode === 'bulk'){
        bulkRunner(peersBulkSize, jobs, callback);
    } else if(mode === 'runnerBulkButSeriesByPlayer'){
        runnerBulkButSeriesByPlayer(mode, peersBulkSize, jobs, callback);
    } else {
        asyncRunner(mode, jobs, callback);
    }
}
function asyncRunner(mode, jobs, callback){
    var enclosedJobs;

    function formJobs(){
        enclosedJobs = jobs.splice(0, jobs.length).map(e => _.isFunction(e) ? e : e.job);
        runJobs();
    }
    function runJobs(){
        let callbackFn = err => {
            if(err){
                callback(err);
            } else if(jobs.length > 0){
                formJobs();
            } else {
                callback(null);
            }
        };

        async[mode](enclosedJobs, callbackFn);
    }

    formJobs();
}
function bulkRunner(peersBulkSize, jobs, callback){
    var bulks;

    function formBulks(){
        bulks = [];
        var howMuchBulks = Math.floor(jobs.length / peersBulkSize);
        _(howMuchBulks).times(n => {
            var enclosedJobs = jobs.slice(n * peersBulkSize, (n + 1) * peersBulkSize);
            bulks.push(cb => async.parallel(enclosedJobs, cb));
        });
        if(jobs.length % peersBulkSize){
            let enclosedJobs = jobs.slice(howMuchBulks * peersBulkSize);
            bulks.push(cb => async.parallel(enclosedJobs, cb));
        }
        jobs.splice(0, jobs.length);

        runBulks();
    }
    function runBulks(){
        let callbackFn = err => {
            if(err){
                callback(err);
            } else if(jobs.length > 0){
                formBulks();
            } else {
                callback(null);
            }
        };

        async.series(bulks, callbackFn);
    }

    formBulks();
}
function runnerBulkButSeriesByPlayer(mode, peersBulkSize, jobs, callback){
    var bulks = [];

    function formBulks(){
        bulks = [];
        var jobsByPlayers = {},
            jobsCount = jobs.length,
            inter = 0,
            _currentBulk = [];

        while(jobs.length > 0){
            let j = jobs.shift();
            if(!jobsByPlayers[j.id]){
                jobsByPlayers[j.id] = [];
            }
            jobsByPlayers[j.id].push(j.job);
        }
        while(inter < jobsCount){
            for(let _id in jobsByPlayers){
                if(jobsByPlayers[_id].length > 0){
                    inter++;
                    _currentBulk.push(jobsByPlayers[_id].shift());
                    if(_currentBulk === peersBulkSize){
                        bulks.push(_currentBulk);
                        _currentBulk = [];
                    }
                }
            }
            bulks.push(_currentBulk);
            _currentBulk = [];
        }

        runBulks();
    }
    function runBulks(){
        let callbackFn = err => {
            if(err){
                callback(err);
            } else if(jobs.length > 0){
                formBulks();
            } else {
                callback(null);
            }
        };

        async.series(bulks.map(e => cb => async.parallel(e, cb)), callbackFn);
    }

    if(mode === 'bulk'){
        formBulks();
    } else {
        runner(mode, peersBulkSize, jobs, callback);
    }
}