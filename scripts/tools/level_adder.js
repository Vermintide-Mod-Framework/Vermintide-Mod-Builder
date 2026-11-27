const fs = require('fs');

const path = require('../lib/path');

// Adds a level to a mod and sets the Modding Tools Content's level editor up to work on it.
//
// The level's files stay in the mod, in levels/<mod_name>/<level_name>, and the Content gets a junction,
// levels/<mod_name>, to the mod's levels/<mod_name> folder, so the editor opens and saves the mod's own files.
// The level is registered with the Content's mod_tools DLC, which the Content has for this:
//   resource_packages/levels/<mod_name>/<level_name>.package, the level's package
//   resource_packages/dlcs/mod_tools.package, which lists it
//   scripts/settings/dlcs/mod_tools/level_settings_mod_tools.lua, its LevelSettings entry, named <level_name>
// The package is not in resource_packages/levels/debug: the game leaves levels with a package there out of its
// list of levels, and then fails when one of them ends, looking for statistics it keeps only for that list.

const MOD_TOOLS_PACKAGE = 'resource_packages/dlcs/mod_tools.package';
const MOD_TOOLS_LEVEL_SETTINGS = 'scripts/settings/dlcs/mod_tools/level_settings_mod_tools.lua';

// A new level: the editor's empty level, with the game's skydome and an environment of the game.
// The environment has to be one of the game's: an end zone blends the level's environment to its
// waystone_environment_01 setting when it opens, and the SDK's default environments don't have it.
// The editor reads a level from editor_metadata, and writes the rest of the file from it when it saves.
// It refuses a level without editor_metadata's Flow, takes the skydome and environment from its Settings,
// and the camera it starts with from its Transients.
const LEVEL_TEXT =
`editor_metadata = {
	Flow = {
		Connections = [
		]
		Groups = [
		]
		Nodes = [
		]
	}
	Groups = [
	]
	Layers = [
		"Default"
	]
	LevelObjectSets = {
		NestedSetNamesBySetName = {
		}
		ObjectIdsBySetName = {
		}
		VisibleSetNames = [
		]
	}
	LevelReferences = [
	]
	LightBakeSettings = {
		ExcludedObjectSets = [
		]
		Layers = [
		]
	}
	LuaPluginObjects = [
	]
	Notes = [
	]
	Overrides = [
	]
	ParticleEffects = [
	]
	PositionMarkers = [
	]
	Prototypes = [
	]
	Replays = [
	]
	Scatter = {
		Dirty = false
		PoolSettings = {
		}
		ScatterData = {
		}
	}
	Settings = {
		FrozenLayers = [
		]
		HiddenLayers = [
		]
		HiddenObjects = [
		]
		LastHiddenObjects = [
		]
		ShadingEnvironment = "environment/default_honduras_02"
		SkydomeUnit = "units/skydome/skydome_hdr"
	}
	Sounds = [
	]
	Splines = [
	]
	Stories = [
	]
	Transients = {
		Camera = {
			FarRange = 1000
			InterestPointDistance = 10
			OrthographicPlane = {
				W = 1
				X = 0
				Y = 0
				Z = 0
			}
			OrthographicZoom = 10
			Pos = {
				X = 0
				Y = -10
				Z = 3
			}
			ProjectionType = 1
			Rot = {
				W = 1
				X = 0
				Y = 0
				Z = 0
			}
			RotationSpeed = 0.003
			TranslationSpeed = 1
		}
	}
	Triggers = [
	]
	Units = [
	]
	Volumes = [
	]
}
flow = {
	nodes = [
	]
}
level_references = [
]
level_settings = {
	num_background_units = 1
	shading_environment = "environment/default_honduras_02"
}
object_sets = {
}
overrides = [
]
particle_effects = [
]
prototypes = [
]
replays = [
]
scatter = [
]
sounds = [
]
splines = [
]
stories = [
]
triggers = [
]
units = [
	{
		cameras = {
		}
		data = {
		}
		id = "skydome-unit"
		lights = {
		}
		material = "units/skydome/skydome_hdr"
		materials = {
		}
		name = ""
		pos = [
			0
			0
			0
		]
		rot = [
			0
			0
			0
			1
		]
		scl = [
			1
			1
			1
		]
		type = "units/skydome/skydome_hdr"
	}
]
volumes = [
]
`;

// The level's package: the level, and the files the editor's bake tools write next to it
// (world_nav_tag_volumes, world_smartobjects, world_spawn_zones)
function _packageText(levelResource) {
    let levelDir = path.dirname(levelResource);

    return `level = [\n\t"${levelResource}"\n]\nlua = [\n\t"${levelDir}/*"\n]\n`;
}

// The level's LevelSettings entry, with the settings the SDK's guide gives as the least a level needs
function _levelSettingsText(levelKey, levelResource, packageResource) {
    return [
        '',
        `-- Added by vmb add-level`,
        `LevelSettings.${levelKey} = {`,
        `\tdisplay_name = "${levelKey}",`,
        `\tlevel_name = "${levelResource}",`,
        `\tpackages = {`,
        `\t\t"${packageResource}",`,
        `\t},`,
        `\tlevel_particle_effects = {},`,
        `\tlevel_screen_effects = {},`,
        `\tknocked_down_setting = "knocked_down",`,
        `\tplayer_aux_bus_name = "environment_reverb_outside",`,
        `\tsource_aux_bus_name = "environment_reverb_outside_source",`,
        `\tenvironment_state = "exterior",`,
        `\tambient_sound_event = "silent_default_world_sound",`,
        `\tlocations = {},`,
        `\tlevel_image = "level_image_any",`,
        `\tloading_ui_package_name = "loading_screen_1",`,
        `\tno_terror_events = true,`,
        `}`,
        ''
    ];
}

// Adds levelName to the mod in modDir and registers it in the Content in contentDir. Returns what was done, line by line.
function addLevel(contentDir, modDir, modName, levelName) {
    let done = [];

    let levelResource = `levels/${modName}/${levelName}/world`;
    let packageResource = `resource_packages/levels/${modName}/${levelName}`;

    _checkLevelKeyFree(contentDir, levelName, levelResource);

    // The level in the mod
    let modLevelsDir = path.combine(modDir, 'levels', modName);
    let levelFile = path.combine(modDir, levelResource + '.level');

    if (fs.existsSync(levelFile)) {
        done.push(`Kept the level that is already in "${levelFile}"`);
    }
    else {
        _makeDir(path.dirname(levelFile));
        fs.writeFileSync(levelFile, LEVEL_TEXT);
        done.push(`Made "${levelFile}"`);
    }

    // The junction from the Content to the mod's levels
    let link = path.combine(contentDir, 'levels', modName);
    if (_linkTarget(link) === null) {
        fs.symlinkSync(modLevelsDir, link, 'junction');
        done.push(`Linked "${link}" to "${modLevelsDir}"`);
    }
    else if (path.fix(_linkTarget(link)).toLowerCase() !== modLevelsDir.toLowerCase()) {
        throw new Error(`"${link}" already exists and doesn't link to "${modLevelsDir}"`);
    }

    // The level's package
    let packageFile = path.combine(contentDir, packageResource + '.package');
    if (!fs.existsSync(packageFile)) {
        _makeDir(path.dirname(packageFile));
        fs.writeFileSync(packageFile, _packageText(levelResource));
        done.push(`Made "${packageFile}"`);
    }

    // The package in the mod_tools DLC's list
    let modToolsPackage = path.combine(contentDir, MOD_TOOLS_PACKAGE);
    if (_addToPackageList(modToolsPackage, packageResource)) {
        done.push(`Listed the package in "${modToolsPackage}"`);
    }

    // The LevelSettings entry
    let levelSettingsFile = path.combine(contentDir, MOD_TOOLS_LEVEL_SETTINGS);
    let levelSettings = fs.readFileSync(levelSettingsFile, 'utf8');
    if (!_definesLevelKey(levelSettings, levelName)) {
        let newline = levelSettings.includes('\r\n') ? '\r\n' : '\n';
        fs.appendFileSync(levelSettingsFile, _levelSettingsText(levelName, levelResource, packageResource).join(newline));
        done.push(`Added LevelSettings.${levelName} to "${levelSettingsFile}"`);
    }

    return done;
}

// Stops if a level of the game already uses the name, or the editor's entry for it is for another level
function _checkLevelKeyFree(contentDir, levelKey, levelResource) {

    for (let file of _luaFilesIn(path.combine(contentDir, 'scripts'))) {
        let text = fs.readFileSync(file, 'utf8');

        if (!_definesLevelKey(text, levelKey)) {
            continue;
        }

        let isOurs = file.endsWith(MOD_TOOLS_LEVEL_SETTINGS) && text.includes(`level_name = "${levelResource}"`);
        if (!isOurs) {
            throw new Error(`The game already has a level named "${levelKey}" (${file}). Choose another name.`);
        }
    }
}

function _definesLevelKey(text, levelKey) {
    return new RegExp(`LevelSettings\\.${levelKey}\\s*=|LevelSettings\\[\\s*"${levelKey}"\\s*\\]\\s*=`).test(text);
}

// The folder a junction or link points to, or null if there's nothing at link
function _linkTarget(link) {
    let stats;

    try {
        stats = fs.lstatSync(link);
    }
    catch (error) {
        return null;
    }

    if (!stats.isSymbolicLink()) {
        throw new Error(`"${link}" already exists and is a folder, not a link`);
    }

    return fs.readlinkSync(link);
}

// Adds an entry to a .package file's package = [ ... ] list, unless it's there. Returns whether it was added.
function _addToPackageList(packageFile, packageResource) {
    let text = fs.readFileSync(packageFile, 'utf8');

    if (text.includes(`"${packageResource}"`)) {
        return false;
    }

    let match = /(^|\n)package\s*=\s*\[[^\]]*/.exec(text);
    if (!match) {
        throw new Error(`"${packageFile}" has no package list`);
    }

    let newline = text.includes('\r\n') ? '\r\n' : '\n';
    let end = match.index + match[0].length;
    let before = text.slice(0, end).replace(/\s*$/, '');

    fs.writeFileSync(packageFile, `${before}${newline}\t"${packageResource}"${newline}${text.slice(end)}`);
    return true;
}

function _luaFilesIn(dir) {
    let files = [];

    for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
        let file = path.combine(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(..._luaFilesIn(file));
        }
        else if (entry.name.endsWith('.lua')) {
            files.push(file);
        }
    }

    return files;
}

function _makeDir(dir) {

    if (fs.existsSync(dir)) {
        return;
    }

    _makeDir(path.dirname(dir));
    fs.mkdirSync(dir);
}

module.exports = { addLevel };
