return {

	-- Called on mod initialization
	init = function (object)

	end,

	-- Called when all mods are being updated each frame
	update = function (object, dt)

	end,

	-- Called when all mods are being unloaded
	on_unload = function (object)

	end,

	-- Called when all mods are being reloaded (always followed by 'on_unload')
	on_reload = function (object)

	end,

	-- Called when game state changes (e.g. StateLoading -> StateIngame)
	on_game_state_changed = function (object, status, state)

	end,
}