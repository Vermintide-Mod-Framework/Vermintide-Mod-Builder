local mod = get_mod("%%name")

-- Everything here is optional, feel free to remove anything you're not using

--[[
	Functions
--]]

-- "Private" function - not accessible to other mods
local function my_function()

end

-- "Public" function - accessible to other mods
function mod.my_function()

end


--[[
	Hooks
--]]

-- If you simply want to call a function after SomeObject.some_function has been executed
-- Arguments for SomeObject.some_function will be passed to my_function as well
mod:hook_safe(SomeObject, "some_function", my_function)

-- If you want to do something more involved
mod:hook(SomeObject, "some_function", function (func, ...)

	-- Your code here

	-- Don't forget to call the original function
	-- If you're not planning to call it, use mod:hook_origin instead
	local result1, result2, etc = func(...)    

	-- Your code here
	
	-- Don't forget to return the return values
	return result1, result2, etc 
end)


--[[
	Callbacks
--]]

-- Called on every update to mods
-- dt - time in milliseconds since last update
mod.update = function(dt)
	
end

-- Called when all mods are being unloaded
-- exit_game - if true, game will close after unloading
mod.on_unload = function(exit_game)
	
end

-- Called when game state changes (e.g. StateLoading -> StateIngame)
-- status - "enter" or "exit"
-- state  - "StateLoading", "StateIngame" etc.
mod.on_game_state_changed = function(status, state)
	
end

-- Called when a setting is changed in mod settings
-- Use mod:get(setting_name) to get the changed value
mod.on_setting_changed = function(setting_name)
	
end

-- Called when the checkbox for this mod is unchecked
-- is_first_call - true if called right after mod initialization
mod.on_disabled = function(is_first_call)

end

-- Called when the checkbox for this is checked
-- is_first_call - true if called right after mod initialization
mod.on_enabled = function(is_first_call)

end


--[[
	Initialization
--]]

-- Initialize and make permanent changes here
