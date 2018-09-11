local mod = get_mod("%%name")

-- Everything here is optional. You can remove unused parts.
return {
	name = "%%title",                               -- Readable mod name
	description = mod:localize("mod_description"),  -- Mod description
	is_togglable = true,                            -- If the mod can be enabled/disabled
	is_mutator = false,                             -- If the mod is mutator
	mutator_settings = {},                          -- Extra settings, if it's mutator
	options_widgets = {                             -- Widget settings for the mod options menu
		{
			setting_name = "example_checkbox",
			widget_type = "checkbox",
			text = mod:localize("example_checkbox_option_name"),
			tooltip = mod:localize("example_checkbox_option_tooltip"),
			default_value = true
		}
	}
}