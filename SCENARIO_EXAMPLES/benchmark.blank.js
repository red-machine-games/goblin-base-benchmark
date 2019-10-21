'use strict';

module.exports = async benchmark => {

    // Write a scenario inside this block!
    // Don't forget about rule of distributed script run - each worker works with it's own piece of peers so don't store values
    // locally except some intermediate results, use benchmark's "share API" - it will make them available for all workers

    // Uncomment next two lines if you're benchmarking Goblin Base Server instance - it's the must. Or just erase otherwise
    // await benchmark.builtins.accountAndProfile();
    // await benchmark.builtins.records();

    // ...

};