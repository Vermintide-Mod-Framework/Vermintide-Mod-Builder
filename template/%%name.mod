return {

    run = function()
        return dofile("scripts/mods/%%name/%%name")
	end,
	
    packages = {
        "resource_packages/%%name/%%name"
	},
	
}