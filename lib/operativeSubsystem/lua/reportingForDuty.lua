local WORKER_NAME = KEYS[1]

redis.call('set', 'w-' .. WORKER_NAME, '1')

return #redis.call('keys', 'w-*')