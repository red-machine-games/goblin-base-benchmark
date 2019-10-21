local TAB_NAME = table.remove(KEYS, 1)

for i=1, #KEYS, 2 do
    local key, value = KEYS[i], KEYS[i + 1]
    local has_a_listener = (redis.call('hget', 'shl-' .. TAB_NAME, key) == value)
    redis.call('hset', TAB_NAME, key, value)
    if has_a_listener then
        redis.call('publish', 'rshl', TAB_NAME .. '-' .. key)
        redis.call('hdel', 'shl-' .. TAB_NAME, key)
    end
end