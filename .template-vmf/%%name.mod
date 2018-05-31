return {
	run = function()
		new_mod("%%name", {
			mod_script       = "scripts/mods/%%name/%%name",
			mod_data         = "scripts/mods/%%name/%%name_data",
			mod_localization = "scripts/mods/%%name/%%name_localization"
		})
	end,
	packages = {
		"resource_packages/%%name/%%name"
	}
}
