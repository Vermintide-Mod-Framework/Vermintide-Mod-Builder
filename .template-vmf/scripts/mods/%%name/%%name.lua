local mod = get_mod("%%name")

--[[
	Functions
--]]



--[[
	Hooks
--]]

mod:hook("", function (func, ...)

	-- Original function
	local result = func(...)
	return result
end)

--[[
	Callback
--]]

-- Call on every update to mods
mod.update = function(dt)
	return
end

-- Call when all mods are being unloaded
mod.on_unload = function(exit_game)
	return
end

-- Call when game state changes (e.g. StateLoading -> StateIngame)
mod.on_game_state_changed = function(status, state)
	return
end

-- Call when setting is changed in mod settings
mod.on_setting_changed = function(setting_name)
	return
end

-- Call when governing settings checkbox is unchecked
mod.on_disabled = function(is_first_call)
	mod:disable_all_hooks()
end

-- Call when governing settings checkbox is checked
mod.on_enabled = function(is_first_call)
	mod:enable_all_hooks()
end


--[[
	Execution
--]]


