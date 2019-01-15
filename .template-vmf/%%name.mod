return {
	run = function()
		fassert(rawget(_G, "new_mod"), "%%title must be lower than Vermintide Mod Framework in your launcher's load order.")

		new_mod("%%name", {
			mod_script       = "scripts/mods/%%name/%%name",
			mod_data         = "scripts/mods/%%name/%%name_data",
			mod_localization = "scripts/mods/%%name/%%name_localization",
		})

		-- We return an empty table to silence warnings about not returning a callback table.
		return { }
	end,
	packages = {
		"resource_packages/%%name/%%name",
	},
}
