return {

	-- Call on mod initialization
    init = function (object)

	end,

	-- Call when all mods are being reloaded (always followed by 'on_unload')
    update = function (object, dt)

	end,

	-- Call when all mods are being unloaded
	on_unload = function (object)

	end,

	-- Call when all mods are being reloaded (always followed by 'on_unload')
    on_reload = function (object)

	end,

	-- Call when game state changes (e.g. StateLoading -> StateIngame)
    on_game_state_changed = function (object, status, state)

	end,
}