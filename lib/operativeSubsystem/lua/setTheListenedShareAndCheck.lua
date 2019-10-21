local TAB_NAME = KEYS[1]
local THE_KEY = KEYS[2]
local PREFERABLE_VALUE = KEYS[3]

local first_check_the_value = redis.call('hget', TAB_NAME, THE_KEY) == PREFERABLE_VALUE
if first_check_the_value then
    redis.call('publish', 'rshl', TAB_NAME .. '-' .. THE_KEY)
    redis.call('hdel', 'shl-' .. TAB_NAME, THE_KEY)
else
    redis.call('hset', 'shl-' .. TAB_NAME, THE_KEY, PREFERABLE_VALUE)
end