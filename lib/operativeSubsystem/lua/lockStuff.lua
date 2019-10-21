local LOCKER_HOLDER = KEYS[1]
local LOCK_HEAD = KEYS[2]
local HOW_MUCH_LOCKS_SHOULD_BE = KEYS[3]
local HOW_MUCH_PEERS_SHOULD_BE = KEYS[4]

redis.call('set', 'lock-' .. LOCK_HEAD .. '-' .. LOCKER_HOLDER, '1', 'px', 5000)

local how_much_now = #redis.call('keys', 'lock-' .. LOCK_HEAD .. '-*')

if how_much_now == tonumber(HOW_MUCH_LOCKS_SHOULD_BE) then
    local work_distribution = tonumber(redis.call('get', 'wd-' .. LOCK_HEAD) or 0)
    local workload = math.floor(HOW_MUCH_PEERS_SHOULD_BE / HOW_MUCH_LOCKS_SHOULD_BE)
    local work_till_i = work_distribution + workload
    local peers_i = tonumber(HOW_MUCH_PEERS_SHOULD_BE)
    if peers_i - work_till_i < tonumber(HOW_MUCH_LOCKS_SHOULD_BE) then
        work_till_i = peers_i
    end
    local work_till = tostring(work_till_i)

    redis.call('set', 'wd-' .. LOCK_HEAD, work_till, 'px', 5000)

    return '1;' .. tostring(work_distribution) .. '-' .. work_till
else
    return '0'
end