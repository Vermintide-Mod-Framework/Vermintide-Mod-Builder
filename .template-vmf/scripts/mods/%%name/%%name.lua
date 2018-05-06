local mod = get_mod("%%name")

-- Everything here is optional. You can remove unused parts.
local mod_data = {
	name = "%%title",               -- Readable mod name
	description = "%%description",  -- Mod description
	is_togglable = true,            -- If the mod can be enabled/disabled
	is_mutator = false,             -- If the mod is mutator
	mutator_settings = {},          -- Extra settings, if it's mutator
	options_widgets = {				-- Widget settings for the mod options menu
		{
			["setting_name"] = "checkbox",
			["widget_type"] = "checkbox",
			["text"] = "Checkbox",
			["tooltip"] = "Checkbox\n" ..
						"Line_1\n\n" ..
						"Line_2\n\n" ..
						"Line_3",
			["default_value"] = true
		}
	},
}

mod:initialize_data(mod_data)

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
mod.on_unload = function()
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


