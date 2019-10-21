redis.replicate_commands()

local HOW_MUCH_LOCKS_SHOULD_BE = KEYS[1]
local LOCKER_HOLDER = KEYS[2]

local roll_call
if not LOCKER_HOLDER then
    roll_call = redis.call('incrby', 'roll-call-lock', 1)
else
    roll_call = redis.call('get', 'roll-call-lock')
end

return roll_call .. ';' .. (HOW_MUCH_LOCKS_SHOULD_BE == roll_call and '1' or '-1')