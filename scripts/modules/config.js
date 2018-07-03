
module.exports = function () {

    module.exports.get = get;
    module.exports.set = set;

    module.exports.readData = readData;
    module.exports.parseData = parseData;
    module.exports.getData = getData;
    module.exports.setData = setData;
    module.exports.writeData = writeData;

    return module.exports;
};

const print = require('../print');

const pfs = require('../lib/pfs');
const path = require('../lib/path');

const cl = require('./cl');

const defaultTempDir = '.temp';

// Data that's written to default .vmbrc
// Also used as a fallback for missing values
let defaultData = {
    mods_dir: 'mods',
    temp_dir: '',

    game: 2,

    game_id1: '235540',
    game_id2: '552500',

    tools_id1: '718610',
    tools_id2: '866060',

    fallback_tools_dir1: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',
    fallback_tools_dir2: 'C:/Program Files (x86)/Steam/steamapps/common/Vermintide 2 SDK/',

    fallback_steamapps_dir1: 'C:/Program Files (x86)/Steam/steamapps/',
    fallback_steamapps_dir2: 'C:/Program Files (x86)/Steam/steamapps/',

    use_fallback: false,

    bundle_extension1: '',
    bundle_extension2: '.mod_bundle',

    use_new_format1: false,
    use_new_format2: true,

    template_dir: ".template-vmf",

    template_preview_image: "item_preview.jpg",

    template_core_files: [
        'core/**'
    ],

    ignored_dirs: [
        '.git',
        defaultTempDir
    ],

    ignore_build_errors: false
};

// Data from external file/object that's been merged with defaultData
let data = {};

// Actual config values
let values = {
    dir: undefined,     // Folder with config file
    filename: '.vmbrc', // Name of config file
    exeDir: undefined,  // Folder with vmb executable

    modsDir: undefined,    // Folder with mods
    tempDir: undefined,    // Folder for temp files created by stingray.exe
    gameNumber: undefined, // Vermintide 1 or 2
    gameId: undefined,     // Steam app id of Vermintide
    toolsId: undefined,    // Steam app id of Vermintide SDK

    fallbackToolsDir: undefined,     // Fallback Vermintide SDK folder
    fallbackSteamAppsDir: undefined, // Fallback steamapps folder
    ignoredDirs: undefined,          // Array of folders that are ignored when scanning for mods

    templateDir: undefined,  // Folder with template for creating new mods
    itemPreview: undefined,  // Name of item preview image file

    // These will be replaced in the template
    templateName: '%%name',
    templateTitle: '%%title',
    templateDescription: '%%description',

    // Files in template
    coreSrc: undefined,  // Blob of files to copy without changes
    modSrc: undefined,   // Blob of files to copy and replace

    defaultBundleDir: undefined,  // Default folder in which the built bundle is gonna be stored
    bundleExtension: undefined,   // Extension of built bundle file
    modFileExtension: '.mod',     // Extension of .mod file

    useNewFormat: undefined,      // Determines whether bundle is renamed and whether .mod file is copied
    ignoreBuildErrors: undefined, // Determines whether stingray.exe exit code should be ignored
    useFallback: undefined,       // Determines whether config paths should be used instead of looking them up

    // Paths to mod tools relative to the mod tools folder
    uploaderDir: 'ugc_uploader/',
    uploaderExe: 'ugc_tool.exe',
    uploaderGameConfig: 'steam_appid.txt',
    stingrayDir: 'bin/',
    stingrayExe: 'stingray_win64_dev_x64.exe'
};

// Returns key value, throws if it's undefined
function get(key) {

    if(values[key] === undefined) {
        throw new Error(`Config key "${key}" is undefined`);
    }

    return values[key];
}

// Sets pairs of keys and values
function set(...pairs) {

    for(let i = 0; i < pairs.length; i += 2) {
        values[pairs[i]] = pairs[i + 1];
    }
}

// Reads and validates config data from file or object
// Path of the file is determined by cl params
async function readData(optionalData) {

    let dir;

    // Set config filename to [object Object] if an object is provided
    let filename = optionalData ? optionalData.toString() : values.filename;

    // Set exe location as current working directory if --cwd flag is set
    let exeDir = cl.get('cwd') ? process.cwd() : path.dirname(process.execPath);

    // See if .vmbrc folder is specified in cl params
    let rc = cl.get('rc') || '';
    if (rc) {
        dir = path.absolutify(String(rc));
        console.log(`Using ${filename} in "${dir}"`);
    }
    else {
        // Otherwise use exe location as config file location
        dir = exeDir;
    }

    // Save values
    values.dir = dir;
    values.filename = filename;
    values.exeDir = exeDir;

    // Read data from file or object
    let shouldReset = cl.get('reset');
    data = optionalData || await _readData(path.combine(dir, filename), shouldReset);

    _validateData(shouldReset);
}

function _validateData(shouldReset) {

    if (!data || typeof data != 'object') {
        throw new Error(`Invalid config data in ${values.filename}`);
    }

    // Merge with default values, overwrite if --reset flag was set
    for (let key of Object.keys(defaultData)) {

        if (shouldReset || data[key] === undefined || data[key] === null) {
            data[key] = defaultData[key];
        }
        else {

            let value = data[key];
            let defaultValue = defaultData[key];

            // Check that value has the same type as default value
            if (!Array.isArray(value) && Array.isArray(defaultValue)) {
                throw new Error(
                    `Invalid value in ${values.filename}: ` +
                    `"${key}" must be of type array, was ${typeof value} instead.`
                );
            }

            if (typeof value != typeof defaultValue) {
                throw new Error(
                    `Invalid value in ${values.filename}: ` +
                    `"${key}" must be of type ${typeof defaultValue}, was ${typeof value} instead.`
                );
            }
        }
    }
}

// Defines config values based on read data
async function parseData() {

    let { modsDir, tempDir } = await _getModsDir(data.mods_dir, data.temp_dir);
    values.modsDir = modsDir;
    values.tempDir = tempDir;

    // Game number and app ids
    values.gameNumber = _getGameNumber(data.game);
    values.gameId = _getGameSpecificKey('game_id');
    values.toolsId = _getGameSpecificKey('tools_id');

    values.defaultBundleDir = 'bundleV' + values.gameNumber;
    values.bundleExtension = _getGameSpecificKey('bundle_extension');

    // Other config params
    values.fallbackToolsDir = path.absolutify(_getGameSpecificKey('fallback_tools_dir'));
    values.fallbackSteamAppsDir = path.absolutify(_getGameSpecificKey('fallback_steamapps_dir'));
    values.ignoredDirs = data.ignored_dirs;

    values.templateDir = _getTemplateDir(data.template_dir);
    values.itemPreview = data.template_preview_image;

    // Files in template
    let { coreSrc, modSrc } = _getTemplateSrc(data.template_core_files, values.templateDir);
    values.coreSrc = coreSrc;
    values.modSrc = modSrc;

    values.useNewFormat = _getGameSpecificKey('use_new_format');
    values.ignoreBuildErrors = data.ignore_build_errors;

    let useFallback = cl.get('use-fallback');
    values.useFallback = useFallback === undefined ? data.use_fallback : useFallback;
}

// Returns a shallow copy of data
function getData() {
    return Object.assign({}, data);
}

// Sets local config data based on cl args
function setData() {

    for (let key of Object.keys(defaultData)) {

        let value = cl.get(key);

        if (value === undefined) {
            continue;
        }

        if(value == 'null') {
            value = defaultData[key];
        }
        else if(typeof defaultData[key] == 'string') {
            value = String(value);
        }
        else if (typeof defaultData[key] == 'number') {
            value = Number(value);
        }
        else if(typeof defaultData[key] == 'boolean') {
            value = value == 'false' ? false : Boolean(value);
        }
        else {
            print.error(`Cannot set key "${key}" because it is an object. Modify ${values.filename} directly.`);
            continue;
        }

        console.log(`Set "${key}" to "${value}"`);
        data[key] = value;
    };
}

// Wrties data to file if it wasn't taken from an object
async function writeData() {

    if(values.filename == data.toString()) {
        return;
    }

    await pfs.writeFile(path.combine(values.dir, values.filename), JSON.stringify(data, null, '\t'));
}

// Reads and parses json data from file, writes default data to it if shouldReset is true
async function _readData(filepath, shouldReset) {

    // Reset config file if it exists
    if (shouldReset && await pfs.accessible(filepath)) {

        try {
            console.log(`Deleting ${path.basename(filepath)}`);
            await pfs.unlink(filepath);
        }
        catch (err) {
            err.message += `\nCouldn't delete ${values.filename}`;
            throw err;
        }
    }

    // Create default config if it doesn't exist
    if (!await pfs.accessible(filepath)) {

        try {
            console.log(`Creating default ${path.basename(filepath)}`);
            await pfs.writeFile(filepath, JSON.stringify(defaultData, null, '\t'));
        }
        catch (err) {
            err.message += `\nCouldn't create ${values.filename}`;
            throw err;
        }
    }

    // Read and parse config file
    try {
        return JSON.parse(await pfs.readFile(filepath, 'utf8'));
    }
    catch (err) {
        err.message += `\nCouldn't read ${values.filename}`;
        throw err;
    }
}

// Returns value of key based on game number
function _getGameSpecificKey(key){
    return data[key + values.gameNumber];
}

// Gets absolute mods dir and temp dir from cl/config data
async function _getModsDir(modsDir, tempDir) {

    modsDir = modsDir ? path.fix(modsDir) : '';
    tempDir = tempDir ? path.fix(tempDir) : '';

    // Set tempDir to modsDir/defaultTempDir if unspecified
    let unspecifiedTempDir = !tempDir;
    if (unspecifiedTempDir) {
        tempDir = path.combine(modsDir, defaultTempDir);
    }

    // Get mods dir from cl
    let newModsDir = cl.get('f') || cl.get('folder') || '';

    if (newModsDir) {

        newModsDir = String(newModsDir);
        modsDir = path.fix(newModsDir);

        // Set tempDir to modsDir/defaultTempDir if unspecified
        if (unspecifiedTempDir) {
            tempDir = path.combine(modsDir, defaultTempDir);
        }

    }

    if(!modsDir) {
        throw new Error(`Mods folder unspecified. Use "." to point to current folder.`);
    }

    modsDir = path.absolutify(modsDir);
    tempDir = path.absolutify(tempDir);

    console.log(`Using mods folder "${modsDir}"`);
    console.log(`Using temp folder "${tempDir}"`);

    if (!await pfs.accessible(modsDir + '/')) {
        throw new Error(`Mods folder "${modsDir}" doesn't exist`);
    }

    return { modsDir, tempDir };
}

// Gets game number from cl/config data and validates it
function _getGameNumber(gameNumber) {
    let newGameNumber = cl.get('g') || cl.get('game');

    if (newGameNumber !== undefined) {
        gameNumber = Number(newGameNumber);
    }

    if (gameNumber !== 1 && gameNumber !== 2) {
        throw new Error(`Vermintide ${gameNumber} hasn't been released yet. Check your ${values.filename}.`);
    }

    console.log(`Game: Vermintide ${gameNumber}`);

    return gameNumber;
}

// Gets absolute template path from cl/config data 
function _getTemplateDir(templateDir) {
    let newTemplateDir = cl.get('template') || '';

    if (newTemplateDir) {
        return path.absolutify(String(newTemplateDir), values.exeDir);
    }

    return path.absolutify(templateDir, values.exeDir);
}

function _getTemplateSrc(configCoreSrc, templateDir) {

    // Static files from config
    let coreSrc = [
        path.combine(templateDir, values.itemPreview)
    ];

    for (let src of configCoreSrc) {
        coreSrc.push(path.combine(templateDir, src));
    };

    // Folders with mod specific files
    let modSrc = [
        templateDir + '/**'
    ];

    // Exclude core files from being altered
    for (let src of coreSrc) {
        modSrc.push('!' + src);
    }

    return { coreSrc, modSrc };
}
