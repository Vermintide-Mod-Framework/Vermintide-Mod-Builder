--[[
	Author: %%author	
--]]

local mod = get_mod("%%template")

mod.options_widgets = {
	{
		["setting_name"] = "dropdown",
		["widget_type"] = "dropdown",
		["text"] = "dropdown",
		["tooltip"] = "dropdown\n" ..
			"Line_1\n\n" ..
			"Line_2\n\n" ..
			"Line_3",
		["options"] = {
			{--[[1]] text = "Value_1",       value = "Value_1"},
			{--[[2]] text = "Value_2",     value = "Value_2"},
			{--[[3]] text = "Value_3", value = "Value_3"},
			{--[[4]] text = "Value_4",    value = "Value_4"},
			{--[[5]] text = "Value_5",     value = "Value_5"},
		},
		["default_value"] = "Value_1", -- Default first option In this case "Value_1"
		["sub_widgets"] = {
			{
				["show_widget_condition"] = {3, 4, 5},

				["setting_name"] = "checkbox",
				["widget_type"] = "checkbox",
				["text"] = "Checkbox",
				["tooltip"] = "Checkbox\n" ..
					"Line_1\n\n" ..
					"Line_2\n\n" ..
					"Line_3",
				["default_value"] = false
			}
		}
	},
	{
		["setting_name"] = "checkbox",
		["widget_type"] = "checkbox",
		["text"] = "Checkbox",
		["tooltip"] = "Checkbox\n" ..
					"Line_1\n\n" ..
					"Line_2\n\n" ..
					"Line_3",
		["default_value"] = true -- Default first option is enabled. In this case true
	}
}


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
mod.unload = function()
	return
end

-- Call when game state changes (e.g. StateLoading -> StateIngame)
mod.game_state_changed = function(status, state)
	return
end

-- Call when setting is changed in mod settings
mod.setting_changed = function(setting_name)
	return
end

-- Call when governing settings checkbox is unchecked
mod.suspended = function()
	mod:disable_all_hooks()
end

-- Call when governing settings checkbox is checked
mod.unsuspended = function()
	mod:enable_all_hooks()
end


--[[
	Execution
--]] 

-- Add option to mod settings menu (args: 1 = widget table, 2 = presence of checkbox in mod settings, 3 = descriptive name, 4 = description)
mod:create_options(mod.options_widgets, true, "%%template", "%%template description")

-- Check for suspend setting
if mod:is_suspended() then
	mod.suspended()
end
