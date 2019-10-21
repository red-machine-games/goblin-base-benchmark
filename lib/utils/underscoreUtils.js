'use strict';

var _ = require('lodash'),
    assert = require('assert'),
    stableSort = require('stable');

_.isAsyncFunction = function(target){
    return _.isFunction(target) ? target.toString().startsWith('async ') : false;
};
_.getPropIgnoreCase = function(obj, keyIgnoreCase, defaultValue){
    assert(obj, 'Object must be provided');
    assert(_.isObject(obj), 'Object must be a type of object');
    assert(keyIgnoreCase, 'Key must be provided');
    assert(_.isString(keyIgnoreCase), 'Key must be a type of string');

    var _key = keyIgnoreCase.toLowerCase();

    for(let prop in obj){
        if(obj.hasOwnProperty(prop) && prop.toLowerCase() === _key){
            return obj[prop];
        }
    }

    return defaultValue;
};
_.stableSortBy = function(array, iteratee, ascending){
    assert(!_.isUndefined(array) && !_.isNull(array), 'Array must be defined');
    if(!_.isBoolean(ascending)){
        ascending = true;
    }

    if(_.isUndefined(iteratee) || _.isNull(iteratee) || !_.isFunction(iteratee)){
        return array;
    }

    return stableSort.inplace(array, (a, b) => {
        if(ascending){
            return iteratee(a) > iteratee(b);
        } else {
            return iteratee(a) < iteratee(b);
        }
    });
};
_.stableSortByCopy = function(array, iteratee, ascending){
    assert(!_.isUndefined(array) && !_.isNull(array), 'Array must be defined');
    if(!_.isBoolean(ascending)){
        ascending = true;
    }

    if(_.isUndefined(iteratee) || _.isNull(iteratee) || !_.isFunction(iteratee)){
        return array;
    }

    return stableSort(array, (a, b) => {
        if(ascending){
            return iteratee(a) > iteratee(b);
        } else {
            return iteratee(a) < iteratee(b);
        }
    });
};