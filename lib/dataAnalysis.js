'use strict';

module.exports = {
    appendBriefInfo: appendBriefInfoImplementation,
    _appendBriefInfo: appendBriefInfo
};

var _ = require('lodash');

function appendBriefInfoImplementation(resultsArray, fileName){
    return appendBriefInfo(
        resultsArray, fileName,
        PREFS.WRITE_RESULT_ARRAY,
        PREFS.WRITE_BENCHMARK_RESULT_ARRAY
    )
}
function appendBriefInfo(resultsArray, fileName, writeResultArray, writeBenchmarkResultArray){
    var infoByCodes = {}, codes = {}, errors = 0,
        benchmark = {};

    _.each(resultsArray, r => {
        if(_.isUndefined(infoByCodes[r.code])){
            infoByCodes[r.code] = { avg: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
        }
        var timeSpent = r.done - r.start || r.timeSpent,
            info = infoByCodes[r.code];
        info.min = Math.min(info.min, timeSpent);
        info.max = Math.max(info.max, timeSpent);
        info.avg += timeSpent;
        if(r.error){
            errors++;
        } else if(!_.has(codes, r.code)){
            codes[r.code] = 1;
        } else {
            codes[r.code]++
        }
        if(r.benchmark){
            let sectors = r.benchmark.split(',');
            _.each(sectors, s => {
                var splt = s.split(':'),
                    intervalName = splt[0],
                    timeSpent = parseInt(splt[1]);

                if(_.isUndefined(benchmark[intervalName])){
                    benchmark[intervalName] = {
                        total: 0, avg: 0, median: [],
                        min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY,
                        times: []
                    };
                }
                benchmark[intervalName].total++;
                benchmark[intervalName].avg += timeSpent;
                benchmark[intervalName].median.push(timeSpent);
                benchmark[intervalName].min = Math.min(benchmark[intervalName].min, timeSpent);
                benchmark[intervalName].max = Math.max(benchmark[intervalName].max, timeSpent);
                benchmark[intervalName].times.push(timeSpent);
            });
        }
        r.timeSpent = timeSpent;
    });
    for(let infC in infoByCodes){
        infoByCodes[infC].avg /= codes[infC];
    }
    _.each(benchmark, v => {
        v.avg /= v.total;
        if(writeBenchmarkResultArray){
            v.times = v.median;
        }
        v.median = _.stableSortByCopy(v.median, e => e)[Math.floor(v.median.length / 2)];
    });

    var RPS, medianTime;

    if(resultsArray.length < 2){
        medianTime = 1;
        RPS = { approximately: 1 };
    } else {
        _.stableSortBy(resultsArray, e => e.start, true);
        let firstTs = _.first(resultsArray).start;
        _.stableSortBy(resultsArray, e => e.done, false);
        let lastTs = _.first(resultsArray).done;

        if(!lastTs || !firstTs){
            RPS = 'Unable to calculate';
        } else if(lastTs - firstTs <= 1000){
            RPS = { approximately: Math.round(resultsArray.length / ((lastTs - firstTs) / 1000)) };
        } else {
            RPS = {};
            let _countsPerSegment = [];
            for(let i = 0 ; i < Math.ceil((lastTs - firstTs) / 1000) ; i++){
                _countsPerSegment.push(resultsArray
                    .filter(e => e.done >= firstTs + i * 1000 && e.done < firstTs + (i + 1) * 1000).length);
            }
            let _countsPerSegmentSorted = _.stableSortByCopy(_countsPerSegment, e => e, true);
            RPS.min = _.first(_countsPerSegmentSorted);
            RPS.max = _.last(_countsPerSegmentSorted);
            if(_countsPerSegmentSorted.length % 2){
                RPS.median = _countsPerSegmentSorted[Math.ceil(_countsPerSegmentSorted.length / 2)]
            } else {
                let _l = _countsPerSegmentSorted[_countsPerSegmentSorted.length / 2 - 1],
                    _r = _countsPerSegmentSorted[_countsPerSegmentSorted.length / 2];
                RPS.median = Math.round((_l + _r) / 2);
            }
            RPS.avg = _countsPerSegmentSorted.reduce((a, b) => a + b, 0);
            RPS.avg = Math.round(RPS.avg / _countsPerSegmentSorted.length);
            RPS.perEverySecond = _countsPerSegment;
            let _countsPerSegmentND2 = _countsPerSegment.filter(e => e > Math.round(RPS.max / 2));
            RPS.avgND2 = Math.round(_countsPerSegmentND2.reduce((a, b) => a + b, 0) / _countsPerSegmentND2.length);
            RPS.perEverySecondND2 = _countsPerSegmentND2;
        }
        medianTime = _.stableSortByCopy(resultsArray, e => e.timeSpent)[Math.round(resultsArray.length / 2)].timeSpent;
    }

    _.each(resultsArray, r => {
        var timeSpent = r.timeSpent || (r.done - r.start);
        for(let infC in infoByCodes){
            infoByCodes[infC].peakPercentage = 0;
            if(timeSpent >= infoByCodes[infC].max * 0.9){
                infoByCodes[infC].peakPercentage = infoByCodes[infC].peakPercentage + 1;
            }
        }
    });
    for(let infC in infoByCodes){
        infoByCodes[infC].peakPercentage /= codes[infC];
    }

    var xDuration,
        xdurations = resultsArray.filter(e => e.xduration != null).map(e => e.xduration);

    if(xdurations && xdurations.length){
        _.stableSortBy(xdurations, e => e, true);
        xDuration = {
            min: _.first(xdurations), max: _.last(xdurations),
            avg: Math.round(xdurations.reduce((a, b) => a + b, 0) / xdurations.length),
            median: xdurations[Math.floor(xdurations.length / 2)]
        };
    }

    return {
        fileName,
        brief: { codes, infoByCodes, errors, RPS, medianTime, 'x-duration': xDuration },
        numOfResults: resultsArray.length,
        resultsArray: writeResultArray ? resultsArray.map(e => {
            e.timeSpent = e.done - e.start;
            delete e.done;
            delete e.start;
            return e;
        }) : undefined,
        benchmark
    };
}