local TARGET_TAB_NAME = KEYS[1]
local TARGET_KEY_NAME = KEYS[2]

local the_value = redis.call('hget', TARGET_TAB_NAME, TARGET_KEY_NAME)

redis.call('hdel', TARGET_TAB_NAME, TARGET_KEY_NAME)

return the_value