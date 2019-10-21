'use strict';

module.exports = {
    go
};

const RUNNER_MODE = 'bulk',
    BENCHMARK_HEADER = 'X-Benchmark-Intervals',
    RESPONSE_TIME_HEADER = 'X-Response-Time';

var _ = require('lodash');

var runner = require('./runners.js').runner,
    requestProxy = require('.//requestProxy.js'),
    getProxy = requestProxy.getProxy,
    postProxy = requestProxy.postProxy,
    measureBase = require('./measureBase.js');

function go(from, to, bulkSize, onRequest, onResponse, callback){
    var asyncJobs = [];

    _(to - from).times(n => {
        asyncJobs.push(cbfn => {
            let cb = (err, response, body, _onRequestTs) => {
                if(!err && !response && !body){
                    return cbfn(null);
                }

                var onRequestDoneTs = _.now(),
                    result;

                if(_onRequestTs){
                    onRequestTs = _onRequestTs;
                }

                if(err || response.statusCode !== 200){
                    result = { error: true, code: response ? response.statusCode || 0 : 0, start: onRequestTs, done: onRequestDoneTs };
                } else {
                    result = { code: response.statusCode, start: onRequestTs, done: onRequestDoneTs };
                    let benchmark = _.getPropIgnoreCase(response.headers, BENCHMARK_HEADER);
                    if(benchmark){
                        result.benchmark = measureBase.prepareBenchmarkTimingSample(benchmark);
                    }
                    let responseTime = _.getPropIgnoreCase(response.headers, RESPONSE_TIME_HEADER);
                    if(responseTime){
                        result.xduration = Math.round(+responseTime);
                    }
                }
                if(onResponse){
                    if(body && !_.isObject(body)){
                        try{
                            body = JSON.parse(body);
                        } catch(err){}
                    }
                    onResponse(n + from, result.code, body, result, cbfn);
                }
            };

            var onRequestTs = _.now();
            onRequest(n + from, getProxy, postProxy, cb);
        });
    });

    runner(RUNNER_MODE, bulkSize, asyncJobs, callback);
}