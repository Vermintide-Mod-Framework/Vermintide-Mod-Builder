return {
	run = function()
		local mod = new_mod("%%template")
		mod:localization("localization/%%template")
		mod:initialize("scripts/mods/%%template/%%template")
	end,
	packages = {
		"resource_packages/%%template/%%template"
	}
}
