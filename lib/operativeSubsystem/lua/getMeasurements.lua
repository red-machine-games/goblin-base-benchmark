redis.replicate_commands()

local LOCKER_HOLDER = KEYS[1]

if redis.call('get', 'msr_getter_done') == '1' then
    return '777'
end

local msr_getter = redis.call('get', 'msr_getter')

if msr_getter and msr_getter ~= LOCKER_HOLDER then
    return '-1'
elseif not msr_getter then
    redis.call('set', 'msr_getter', LOCKER_HOLDER)
end

local function workout_msr_getter_cursor(msr_getter_current_key)
    local msr_getter_hash_cursor = redis.call('get', 'msr_getter_hash_cursor') or '0'
    local the_hash_scan = redis.call('hscan', msr_getter_current_key, msr_getter_hash_cursor, 'count', 1000)

    if the_hash_scan[1] == '0' then
        redis.call('del', 'msr_getter_hash_cursor')
        redis.call('lpop', 'msr_getter_current_key')
    else
        redis.call('set', 'msr_getter_hash_cursor', the_hash_scan[1])
    end

    local the_answer = msr_getter_current_key .. '=='
    if #the_hash_scan[2] > 0 then
        for i=1, #the_hash_scan[2], 2 do
            the_answer = the_answer .. the_hash_scan[2][i] .. '=' .. the_hash_scan[2][i + 1]
            if i < #the_hash_scan[2] then
                the_answer = the_answer .. '/'
            end
        end
        return the_answer
    else
        return the_answer .. '-1'
    end
end

local msr_getter_current_key = redis.call('lrange', 'msr_getter_current_key', 0, 0)
if #msr_getter_current_key == 0 then
    msr_getter_current_key = nil
else
    msr_getter_current_key = msr_getter_current_key[1]
end

if not msr_getter_current_key then
    local msr_getter_scan_cursor = redis.call('get', 'msr_getter_scan_cursor') or '0'
    local the_scan = redis.call('scan', msr_getter_scan_cursor, 'match', 'msr:*', 'count', 1)
    if the_scan[1] == '0' then
        redis.call('set', 'msr_getter_done', 1)
        if #the_scan[2] == 0 then
            return '777'
        end
    else
        redis.call('set', 'msr_getter_scan_cursor', the_scan[1])
    end
    if #the_scan[2] == 0 then
        return '-1'
    else
        redis.call('rpush', 'msr_getter_current_key', unpack(the_scan[2]))
        msr_getter_current_key = the_scan[2][1]
    end
end

if msr_getter_current_key then
    return '1;' .. workout_msr_getter_cursor(msr_getter_current_key)
else
    return '-1'
end