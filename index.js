'use strict';

(() => {
    var _ = require('lodash'),
        path = require('path'),
        commander = require('commander');

    commander
        .version(require('./package.json').version)
        .option('--peers <peers>', 'How many test players(peers) to imitate')
        .option('--bulkSize <bulkSize>', 'Requests bulk size for every node process')
        .option('--onHost <onHost>', 'Target host to attack')
        .option('--onPort <onPort>', 'Target port to attack')
        .option('--redisHost <redisHost>', 'Host of Redis for cluster control')
        .option('--redisPort <redisPort>', 'Port of Redis for cluster control')
        .option('--redisAuth <redisAuth>', 'Redis password if presented')
        .option('--proc <proc>', 'The count of daemons that "cluster" module will produce')
        .option('--proct <proct>', 'The total amount of daemons that should be in cluster(equal to proc by default)')
        .option('--pref <pref>', 'A path to preferences JSON file. A default if not provided')
        .option('--bench <bench>', 'A path to benchmark scenario javascript file')
        .parse(process.argv);

    var cluster = require('cluster'),
        ip = require('ip');

    var redisLocker = require('./lib/operativeSubsystem/redisLocker.js');

    var thisParticularWorkerName;

    function theBeginningStuff(){
        require('./lib/utils/underscoreUtils.js');
        global.glog = {
            stream: { write: _.noop },
            info: function(){
                console.log(`${process.env.i} | ${arguments ? Array.prototype.join.call(arguments, ', ') : ''}`);
            },
            error: function(){
                console.error(`${process.env.i} | ${arguments ? Array.prototype.join.call(arguments, ', ') : ''}`);
            },
            debug: function(){
                console.log(`${process.env.i} | ${arguments ? Array.prototype.join.call(arguments, ', ') : ''}`);
            }
        };
        if(commander.pref){
            global.PREFS = require(path.isAbsolute(commander.pref) ? commander.pref : path.join(process.cwd(), commander.pref)) || null;
        }
        if(!global.PREFS){
            global.PREFS = require('./defaultPrefs.json');
        }

        connectToRedis();
    }
    function connectToRedis(){
        let callbackFn = () => {
            console.log(`${process.env.i} | connectToRedis... OK`);
            redisLocker.injectWorkerName(thisParticularWorkerName);
            redisLocker.injectTotalCount(+commander.proct || +commander.proc || 1);
            redisLocker.injectPeersCount(+commander.peers);
            waitForAllConnected();
        };

        console.log(`${process.env.i} | connectToRedis...`);
        require('./lib/operativeSubsystem/redisConnection.js')
            .doConnect(commander.redisHost, commander.redisPort, commander.redisAuth, callbackFn);
    }
    function waitForAllConnected() {
        let callbackFn = err => {
            if(err){
                console.log(`${process.env.i} | waitForAllConnected... ERROR`);
                console.error(err);
                process.exit(-1);
            } else {
                console.log(`${process.env.i} | waitForAllConnected... OK`);
                require('./benchmarkRunner.js').doRun(
                    +commander.bulkSize, commander.onHost,
                    commander.onPort, path.isAbsolute(commander.bench) ? commander.bench : path.join(process.cwd(), commander.bench),
                    commander.peers, +commander.proct || +commander.proc || 1
                );
            }
        };

        if(+commander.bulkSize < 2){
            console.warn(`!!! YOUR BULK SIZE IS ${commander.bulkSize}. RECOMMENDED TO MAKE IT AT LEAST 2`);
        }

        console.log(`${process.env.i} | waitForAllConnected...`);
        redisLocker.lockBeforeBeginning(callbackFn);
    }

    var howMuchProcsAtLocal = +commander.proc || 1;
    if(cluster.isMaster && howMuchProcsAtLocal > 1){
        console.log(require('fs').readFileSync(require('path').join(__dirname, 'TheArt')).toString());
        console.log('IS MASTER');
        for(let i = 0 ; i < howMuchProcsAtLocal ; i++){
            console.log(`FORKING #${i + 1}`);
            cluster.fork({ i });
        }
    } else {
        if(howMuchProcsAtLocal === 1){
            process.env.i = '0';
        }
        console.log(`${process.env.i} | IS FORKED`);
        thisParticularWorkerName = `${ip.address()}-${process.env.i}`;
        theBeginningStuff();
    }
})();