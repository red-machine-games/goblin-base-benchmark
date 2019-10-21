local TAB_NAME = table.remove(KEYS, 1)

local to_return = {}

for i=1, #KEYS, 2 do
    local key, increment = KEYS[i], tonumber(KEYS[i + 1])
    local value = redis.call('hincrby', TAB_NAME, key, increment)
    table.insert(to_return, value)
    local has_a_listener = (redis.call('hget', 'shl-' .. TAB_NAME, key) == tostring(value))
    if has_a_listener then
        redis.call('publish', 'rshl', TAB_NAME .. '-' .. key)
        redis.call('hdel', 'shl-' .. TAB_NAME, key)
    end
end

return table.concat(to_return, ';')