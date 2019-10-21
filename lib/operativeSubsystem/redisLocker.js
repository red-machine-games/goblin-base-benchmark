'use strict';

module.exports = {
    injectWorkerName,
    injectTotalCount,
    injectPeersCount,
    lockBeforeBeginning,
    lockInProcess
};

var redisConnection = require('./redisConnection.js');

var workerName,
    totalCount,
    peersCount;

function injectWorkerName(_workerName){
    workerName = _workerName;
}
function injectTotalCount(_totalCount){
    totalCount = _totalCount;
}
function injectPeersCount(_peersCount){
    peersCount = _peersCount;
}

function lockBeforeBeginning(callback){
    function checkAllWorkersAreOnPlace(){
        let callbackFn = (err, response) => {
            if(err){
                callback(err);
            } else if(+response === totalCount){
                callback(null);
            } else {
                setTimeout(checkAllWorkersAreOnPlace, 1000);
            }
        };

        redisConnection.getTheClient().reportingForDuty([workerName], callbackFn);
    }

    checkAllWorkersAreOnPlace();
}
function lockInProcess(lockHeader, callback){
    var _wmr = false;

    function checkTheLock(){
        let callbackFn = (err, response) => {
            if(err){
                console.log(`${process.env.i} | checkTheLock @ lockInProcess @ redisLocker.js ERROR`);
                callback(err);
            } else if(response.startsWith('1;')){
                console.log(`${process.env.i} | checkTheLock @ lockInProcess @ redisLocker.js workerName=${workerName} lockHeader=${lockHeader} OK response=${response}`);
                callback(null, response.replace('1;', '').split('-').map(e => +e));
            } else {
                if(!_wmr){
                    _wmr = true;
                    console.log(`${process.env.i} | checkTheLock @ lockInProcess @ redisLocker.js workerName=${workerName} lockHeader=${lockHeader} WAIT MORE`);
                }
                setTimeout(checkTheLock, 50);
            }
        };

        if(!_wmr){
            console.log(`${process.env.i} | checkTheLock @ lockInProcess @ redisLocker.js workerName=${workerName} lockHeader=${lockHeader} totalCount=${totalCount} peersCount=${peersCount}`);
        }
        redisConnection.getTheClient().lockStuff([workerName, lockHeader, totalCount, peersCount], callbackFn);
    }

    checkTheLock();
}