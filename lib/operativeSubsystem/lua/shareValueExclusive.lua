local TAB_NAME = KEYS[1]
local KEY = KEYS[2]
local VALUE = KEYS[3]

local try_value = redis.call('hget', TAB_NAME, KEY)

if not try_value then
    redis.call('hset', TAB_NAME, KEY, VALUE)
    return '1'
else
    return nil
end