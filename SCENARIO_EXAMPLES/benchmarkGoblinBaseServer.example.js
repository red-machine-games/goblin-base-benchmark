'use strict';

/**

 It's a working example of benchmark scenario. It benches accounts, profiles, tickets and websocket PvP
 (matchmaking, accepting, 15 turns and finishing).
 The result represented as a JSON files (at _benchmarkResults_ directory).

 !!!~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!!!
 |  This benchmark scenario designed for default configs  |
 |  and cloud functions of goblin-base-server-bootstrap   |
 !!!~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!!!

 */

module.exports = async benchmark => {   // This is a beginning of scenario - one async function on exports with "benchmark" agument

    await benchmark.builtins.accountAndProfile();   // Builtin scenario works out account and profiles
    // This is special - the must before any further actions if you're benchmarking Goblin Base instance
    // It winds up all human IDs and unicorns for further use.

    // Run builtin records to benchmark and wind up records for matchmaking
    await benchmark.builtins.records();

    var benchTickets = benchmark.http({ // That's how we declare benchmark on HTTP route
        method: 'post', // Can declare method (GET by default)
        head: 'tickets-sendTicket', // The header that'll be used for results file(must not contain bad symbols)
        uri: '/tickets.sendTicket', // Path-part of URI (NO QUERY!)
    }); // We got the benchmark instance(benchTickets)

    // To accomplish benchmark run the async method "getDone"(with await) that has argument "onRequest" lambda
    // - it must return plain object with fields: query(optional, object be transformed into query args),
    // body(optional, application/json to be transformed via POST), headers(optional, plain object representing any custom-defined headers)
    // and bookingKey(optional, in case you're testing Goblin Base instance and requesting PvP room). As an argument it should
    // get the "n" - number of peer(player) according to particular request. This lambda can be sync and async depends on
    // whether developer plans to get some async data(as in example below)
    var results = await benchTickets.getDone(async n => {

        // Getting the share via share API. First argument is header of "table", the second - number of peer(player).
        // Concretely here we're getting human ID of peer n, that we got automatically during run of builtin accountAndProfile scenario.
        // But it is up to developer
        var theHid = +await benchmark.getShare('humanId', n);
        return {
            query: { receiverId: theHid < benchmark.peersCount ? theHid + 1 : 1 },
            body: { ticketCallback: false, ticketPayload: { hello: 'world' }, ticketHead: 'Hello world' }
        };
    });

    var benchTicketsListing = benchmark.http({  // The same but without setting method(GET by default)
        head: 'tickets-listReceivedTickets',
        uri: '/tickets.listReceivedTickets',
    });
    // Request without body
    results = await benchTicketsListing.getDone(() => { return { query: { skip: 0, limit: 20 } } });

    var pvpSearchForOpponent = benchmark.http({
        method: 'post',
        head: 'pvp-searchForOpponent',
        uri: '/pvp.searchForOpponent',
    });
    results = await pvpSearchForOpponent.getDone(() => { return {
        query: { segment: 'def', strat: 'byr' },
        body: { rgs: [{ from: '+inf', to: '-inf' }] }
    }});

    var pvpAcceptMatch = benchmark.http({
        head: 'pvp-acceptMatch',
        uri: '/pvp.acceptMatch',
    });
    results = await pvpAcceptMatch.getDone();   // We can send no data

    var pvpWaitForOpponent = benchmark.http({
        head: 'pvp-waitForOpponentToAccept',
        uri: '/pvp.waitForOpponentToAccept',
    });
    results = await pvpWaitForOpponent.getDone();

    // Now we're going to share data by hands. You should NOT store useful data in local variables(except some intermediate data)
    // because in parallel run different workers can't access particular worker's memory. To make this data instantly available
    // for all workers - use share API to place it into Redis.
    for(let i = 0 ; i < results.length ; i++){
        // From "pvpWaitForOpponent" benchmark we got and array of responses into "results" variable - they contains
        // pvp room address and booking keys. We will share this useful data for all workers like this:
        await benchmark.shareValue('pvp-address', results[i].n, JSON.stringify(results[i].body.address));
        if(results[i].body.key){
            // and this:
            await benchmark.shareValue('pvp-key', results[i].n, results[i].body.key);
        } else {
            console.error(results[i].body);
        }
    }

    // Now we're ahead for testing pvp room and we got new nuances
    var pvpReleaseBooking = benchmark.http({
        method: 'post',
        head: 'pvp-releaseBooking',
        uri: '/releaseBooking'
    });

    // Releasing booking key at pvp room
    results = await pvpReleaseBooking.getDone(
        // Now we providing two lambdas. The first - for query, body and bookingKey.
        // The second - for overriding target host and port(as far as Goblin Base/Cloud server implements cluster of pvp rooms)
        async n => { return { query: null, body: null, bookingKey: await benchmark.getShare('pvp-key', n) } },
        async n => {    // It's [override host, override port]
            // Here we see how we get previously shared data with gameroom address for particular peer
            let address = JSON.parse(await benchmark.getShare('pvp-address', n));
            return [address.hosts.asDomain || address.hosts.asIP, address.ports.ws || address.ports.wss];
        }
    );

    var pvpSetPayload = benchmark.http({
        method: 'post',
        head: 'pvp-setPayload',
        uri: '/setPayload'
    });
    results = await pvpSetPayload.getDone(
        async n => { return { query: null, body: { player: n + 1, payload: 'some payload' }, bookingKey: await benchmark.getShare('pvp-key', n) } },
        async n => {
            let address = JSON.parse(await benchmark.getShare('pvp-address', n));
            return [address.hosts.asDomain || address.hosts.asIP, address.ports.ws || address.ports.wss];
        }
    );

    var pvpSetReady = benchmark.http({
        method: 'post',
        head: 'pvp-setReady',
        uri: '/setReady'
    });
    results = await pvpSetReady.getDone(
        async n => { return { query: null, body: null, bookingKey: await benchmark.getShare('pvp-key', n) } },
        async n => {
            let address = JSON.parse(await benchmark.getShare('pvp-address', n));
            return [address.hosts.asDomain || address.hosts.asIP, address.ports.ws || address.ports.wss];
        }
    );

    // We share awaiting ones because last message should be sent by unique pair opponents to finish the game.
    // (We take awaiting ones as unique pair opponents)
    for(let i = 0 ; i < results.length ; i++){
        if(results[i].body.c === 2){
            await benchmark.shareValue('pvp-waitings', results[i].n, '1');
        }
    }

    // Here we get websocket benchmark
    var wsPvpGameroom = benchmark.ws({
        head: 'ws-pvp-gameroom',
        uri: '/',
        overridePrefix: ''  // Overriding prefix with empty string to make uri clear
    });

    // Unlike http benchmark for websocket benchmark you must make connections first. In response we get an object
    //  - wsPvpGameroomSockets with API to control websockets:
    /**
     * async sendMessages(messageLambda, noLockingBefore) - Broadcast through all websockets associated with
     *      particular benchmark (wsPvpGameroomSockets);
     * async closeConnections(beforeCloseLambda) - close all websockets
     * onMessage(onMessageCallback) - listen for every message of every websocket;
     * onClose(onCloseCallback) - listen for close of every websocket
     * async startMeasure(measureHead, n) - Start measure for peer n
     * async stopMeasure(measureHead, n) - End measure for peer n
     *
     */
    var wsPvpGameroomSockets = await wsPvpGameroom.wsConnect(
        // First argument - a postfix for file name with connections measures
        'connected',
        // Second one - a lambda returning connection query
        async n => { return { bkey: await benchmark.getShare('pvp-key', n), pv: benchmark.platformAndVersion } },
        // Third one - a lambda returning override address: [target host, target port]
        async n => {
            let address = JSON.parse(await benchmark.getShare('pvp-address', n));
            return [address.hosts.asDomain || address.hosts.asIP, address.ports.ws || address.ports.wss];
        },
        // Fourth one is a special lambda that fires on message but before benchmark's "onMessage" listener.
        // In this particular case we get the after-connection message with info about pvp
        async (n, message) => {
            if(message.c === 4 && message.state && message.state.model){
                let me = message.state.model.mdl.model[message.state.isA ? 'playerA' : 'playerB'].aPayload.player,
                    him = message.state.model.mdl.model[message.state.isA ? 'playerB' : 'playerA'].aPayload.player;
                // And sharing opponents' IDs. It will be useful further
                await benchmark.shareValue('pvp-opponent', me, him);
                await benchmark.incrementAndGetShare('pvp-state', 'con');
            }
        }
    );

    // Let's wait everybody connected and go onConnection message
    await benchmark.listenShareEqualTo('pvp-state', 'con', benchmark.peersCount);

    // Finally we see the async (anonymous) function representing full pvp cycle as 3 async sub-functions:
    // ping, turns and finalizing
    await (async () => {
        // Firstly test the ping
        async function pingMessage(){
            // Winding up "onMessage" listener - get peer's n and message(n is omitted here)
            wsPvpGameroomSockets.onMessage(async (__, message) => {
                // Checking that's ping
                if(message.yrAvg || message.oppAvg){
                    // Atomically increment and get shared number
                    // We need that counter to sync all workers in-moment when all ping messages will be done
                    await benchmark.incrementAndGetShare('bn', 'pingMessage');
                }
            });

            // Do broadcast
            await wsPvpGameroomSockets.sendMessages(() => { return { message: { ping: 10 } } });
            // So that's the interesting one. It blocks further script run until 'pingMessage' @ 'bn' is equal to "benchmark.peersCount"(total count of peers)
            // Here we use this "bottle neck" to make all workers wait each other before pings be done
            await benchmark.listenShareEqualTo('bn', 'pingMessage', benchmark.peersCount);
            await battleMessage(1);
        }
        // Now testing battle turns(testing cloud functions with 15 turns to finish)
        // This function is recursion
        async function battleMessage(turnN){
            // Winding up "onMessage" listener
            wsPvpGameroomSockets.onMessage(async (n, message) => {
                // That's interesting.
                // We'll measure turns with benchmark's measure API:
                // Start measure from async method startMeasure(measureHead, n)
                // Stop measure at async method метода stopMeasure(measureHead, n)
                // Later we'll see the result in result JSON file
                var opponentN = +(await benchmark.getShare('pvp-opponent', n + 1)) - 1;
                await wsPvpGameroomSockets.stopMeasure(
                    `gp-turn-${turnN}`,
                    // The idea is that we start measuring when n'th player sends turn via websocket and end measuring
                    // when his opponent gets it (that's the messaging bus in a nutshell)
                    opponentN
                );
                if(message._t != null){
                    // By the way if pvp's "attachMessageTimeAtRoom" param configured to TRUE we'll see additional node
                    // on response - amount of ms that message spent inside of pvp room (omitting traverse time)
                    await wsPvpGameroomSockets.pushMeasure(`gp-turn-${turnN}-pure`, opponentN, message._t);
                }
                if(message.m && message.oppsq){
                    // The same trick as ping's
                    await benchmark.incrementAndGetShare('bn', 'battleMessage');
                }
            });

            await wsPvpGameroomSockets.sendMessages(async n => {
                // As mentioned before we start measure and sending
                // In our case we measure two things - time for all gameplay and time for one particular turn
                await wsPvpGameroomSockets.startMeasure(`gp-turn-${turnN}`, n);
                if(turnN === 1){
                    await wsPvpGameroomSockets.startMeasure('fullGamePlay', n);
                }

                // Here we return message itself and booking key (need)
                return {
                    message: { send: { hello: 'world' } },
                    bookingKey: await benchmark.getShare('pvp-key', n)
                };
                // The last TRUE is to make all workers not wait for each other before yet another messages broadcast
                // (It could affect measurements)
            }, true);
            await benchmark.listenShareEqualTo('bn', 'battleMessage', benchmark.peersCount * turnN);
            if(turnN === 14){
                await finishBattleMessage();
            } else {
                await battleMessage(turnN + 1);
            }
        }
        // The finalizing (15th turn)
        async function finishBattleMessage(){
            // We wind up "onClose" listener before finalizing
            wsPvpGameroomSockets.onClose(async (n, code, endMessage) => {
                if(code === 4200 && endMessage && endMessage.gameIsOver){
                    // Stop measure of all gameplay for particular peer
                    await wsPvpGameroomSockets.stopMeasure('fullGamePlay', n);
                    await benchmark.incrementAndGetShare('bn', 'finishBattleMessage');
                }
            });
            // Nullify "onMessage" listener (useless henceforth)
            wsPvpGameroomSockets.onMessage(null);

            // Broadcasting 15th turns
            // (Here we'll use unique opponents shared before)
            // (The amount of unique opponents is a half of all peers)
            await wsPvpGameroomSockets.sendMessages(async n => {
                if(await benchmark.getShare('pvp-waitings', n) === '1'){
                    return {
                        message: { gameOver: true },
                        bookingKey: await benchmark.getShare('pvp-key', n)
                    };
                } else {
                    return null;
                }
            }, true);
            // Wait for everybody finalizing
            await benchmark.listenShareEqualTo('bn', 'finishBattleMessage', benchmark.peersCount);
            // After that Goblin Base Benchmark will automatically generate JSON files with results
        }

        // Entry point for gameplay benchmark
        await pingMessage();
    })();

};