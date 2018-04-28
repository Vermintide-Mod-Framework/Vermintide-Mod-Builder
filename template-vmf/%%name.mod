return {
	run = function()
		local mod = new_mod("%%name")
		mod:localization("localization/%%name")
		mod:initialize("scripts/mods/%%name/%%name")
	end,
	packages = {
		"resource_packages/%%name/%%name"
	}
}
