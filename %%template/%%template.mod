print("[LOADING MOD] %%template")

return {
	run = function()
		local mod = new_mod("%%template")
		mod:localization("localization/%%template")
		mod:dofile("scripts/mods/%%template/%%template")
	end,
	packages = {
		"resource_packages/%%template/%%template"
	}
}
