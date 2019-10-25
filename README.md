[![NPM](https://nodei.co/npm/goblin-base-benchmark.png?downloads=true)](https://www.npmjs.com/package/goblin-base-benchmark)

# Goblin Base Benchmark

It is a scenario-based clustered benchmark tool for [Goblin Base Server](https://github.com/red-machine-games/goblin-base-server) instance or any http/websocket server.

Use a plain javascript with `async/await` to make a benchmarking scenario - the result is represented by a bunch of JSON-files with performance data.

## Usage

### Install

`$ npm install -g goblin-base-benchmark`

### Use

```
Usage: index [options]

Options:
  -V, --version            output the version number
  --peers <peers>          How many test players(peers) to imitate
  --bulkSize <bulkSize>    Requests bulk size for every node process
  --onHost <onHost>        Target host to attack
  --onPort <onPort>        Target port to attack
  --redisHost <redisHost>  Host of Redis for cluster control
  --redisPort <redisPort>  Port of Redis for cluster control
  --redisAuth <redisAuth>  Redis password if presented
  --proc <proc>            The count of daemons that "cluster" module will produce
  --proct <proct>          The total amount of daemons that should be in cluster(equal to proc by default)
  --pref <pref>            A path to preferences JSON file. A default if not provided
  --bench <bench>          A path to benchmark scenario javascript file
  -h, --help               output usage information
```

## An example of scenarios with commentary

 - A blank scenario: https://github.com/red-machine-games/goblin-base-benchmark/blob/master/SCENARIO_EXAMPLES/benchmark.blank.js
 - An example of Goblin Base Server benchmarking - http and websockets: https://github.com/red-machine-games/goblin-base-benchmark/blob/master/SCENARIO_EXAMPLES/benchmarkGoblinBaseServer.example.js
 - An example of preferences file: https://github.com/red-machine-games/goblin-base-benchmark/blob/master/PREFS_EXAMPLES/goblinBaseServerPrefs.example.json

## Other links

 - Goblin Base Server's repository: https://github.com/red-machine-games/goblin-base-server
 - Documentation: https://gbase.tech/doc

# LICENSE

MIT