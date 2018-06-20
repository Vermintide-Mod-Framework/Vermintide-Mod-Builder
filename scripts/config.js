
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

const pfs = require('./lib/pfs');
const path = require('./lib/path');

const cl = require('./cl');
const print = require('./print');

const defaultTempDir = '.temp';

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

    use_external_mod_file1: false,
    use_external_mod_file2: false,

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

let data = {};

let values = {
    dir: undefined,
    filename: '.vmbrc',
    exeDir: undefined,

    modsDir: undefined,
    tempDir: undefined,
    gameNumber: undefined,
    gameId: undefined,
    toolsId: undefined,

    // Other config params
    fallbackToolsDir: undefined,
    fallbackSteamAppsDir: undefined,
    ignoredDirs: undefined,

    // These will be replaced in the template mod when running tasks
    templateDir: undefined,
    templateName: '%%name',
    templateTitle: '%%title',
    templateDescription: '%%description',
    itemPreview: undefined,

    // Folder in which the built bundle is gonna be stored before being copied to workshop folder
    defaultBundleDir: undefined,
    bundleExtension: undefined,
    modFileExtension: '.mod',
    useExternalModFile: undefined,

    // Files in template
    coreSrc: undefined,
    modSrc: undefined,

    // Paths to mod tools relative to the mod tools folder
    uploaderDir: 'ugc_uploader/',
    uploaderExe: 'ugc_tool.exe',
    uploaderGameConfig: 'steam_appid.txt',
    stingrayDir: 'bin/',
    stingrayExe: 'stingray_win64_dev_x64.exe'
};

function get(key) {

    if(values[key] === undefined) {
        throw new Error(`Config key "${key}" is undefined`);
    }

    return values[key];
}

function set(...pairs) {
    for(let i = 0; i < pairs.length; i += 2) {
        values[pairs[i]] = pairs[i + 1];
    }
}

async function readData(optionalData) {

    let exeDir = cl.get('cwd') ? process.cwd() : path.dirname(process.execPath);
    let dir;
    let filename = values.filename = optionalData ? optionalData.toString() : values.filename;

    if(cl.get('rc')){
        dir = path.absolutify(cl.get('rc'));
        console.log(`Using ${filename} in "${dir}"`);
    }
    else{
        dir = exeDir;
    }

    values.exeDir = exeDir;
    values.dir = dir;

    let shouldReset = cl.get('reset');
    data = optionalData || await _readData(path.combine(dir, filename), shouldReset);

    if (!data || typeof data != 'object') {
        throw new Error(`Invalid config data in ${filename}`);
    }

    for(let key of Object.keys(defaultData)) {

        if (shouldReset || data[key] === undefined) {
            data[key] = defaultData[key];
        }
    }
}

async function parseData() {

    let { modsDir, tempDir } = await _getModsDir(data.mods_dir, data.temp_dir);
    values.modsDir = modsDir;
    values.tempDir = tempDir;

    // Game number
    values.gameNumber = _getGameNumber(data.game);
    values.gameId = _getGameSpecificKey('game_id');
    values.toolsId = _getGameSpecificKey('tools_id');

    values.defaultBundleDir = 'bundleV' + values.gameNumber;
    values.bundleExtension = _getGameSpecificKey('bundle_extension');
    values.useExternalModFile = _getGameSpecificKey('use_external_mod_file', 'boolean');

    // Other config params
    values.fallbackToolsDir = path.absolutify(_getGameSpecificKey('fallback_tools_dir'));
    values.fallbackSteamAppsDir = path.absolutify(_getGameSpecificKey('fallback_steamapps_dir'));
    values.ignoredDirs = data.ignored_dirs || [];

    values.templateDir = _getTemplateDir(data.template_dir || '');
    values.itemPreview = data.template_preview_image || '';

    // Files in template
    let { coreSrc, modSrc } = _getTemplateSrc(data.template_core_files, values.templateDir);
    values.coreSrc = coreSrc;
    values.modSrc = modSrc;

    values.useFallback = cl.get('use-fallback') || data.use_fallback;

    values.ignoreBuildErrors = data.ignore_build_errors;
}

function getData() {
    return Object.assign({}, data);
}

function setData() {

    for (let key of Object.keys(defaultData)) {

        let value = cl.get(key);

        if (value === undefined) {
            continue;
        }

        if (typeof defaultData[key] == 'object') {
            print.error(`Cannot set key "${key}" because it is an object. Modify ${values.filename} directly.`);
            continue;
        }

        if(typeof defaultData[key] == 'string') {
            value = String(value);
        }
        else if (typeof defaultData[key] == 'number') {
            value = Number(value);
        }
        else if(typeof defaultData[key] == 'boolean') {
            value = value == 'false' ? false : Boolean(value);
        }

        console.log(`Set ${key} to ${value}`);
        data[key] = value;
    };
}

async function writeData() {

    if(values.filename == data.toString()) {
        return;
    }

    await pfs.writeFile(path.combine(values.dir, values.filename), JSON.stringify(data, null, '\t'));
}


async function _readData(filepath, shouldReset) {

    if (shouldReset && await pfs.accessible(filepath)) {

        try {
            console.log(`Deleting ${path.basename(filepath)}`);
            await pfs.unlink(filepath);
        }
        catch (err) {
            err.message += `\nCouldn't delete config`;
            throw err;
        }
    }

    if (!await pfs.accessible(filepath)) {

        try {
            console.log(`Creating default ${path.basename(filepath)}`);
            await pfs.writeFile(filepath, JSON.stringify(defaultData, null, '\t'));
        }
        catch (err) {
            err.message += `\nCouldn't create config`;
            throw err;
        }
    }

    try {
        return JSON.parse(await pfs.readFile(filepath, 'utf8'));
    }
    catch (err) {
        err.message += `\nCouldn't read config`;
        throw err;
    }
}

function _getGameSpecificKey(key, type = 'string'){
    let id = data[key + values.gameNumber] || defaultData[key + values.gameNumber];

    if (typeof id != type) {
        throw new Error(`Failed to find '${key + values.gameNumber}' in ${values.filename}. It must be a ${type}.`);
    }

    return id;
}

async function _getModsDir(modsDir, tempDir) {

    modsDir = (typeof modsDir == 'string' && modsDir !== '') ? path.fix(modsDir) : 'mods';
    tempDir = (typeof tempDir == 'string' && tempDir !== '') ? path.fix(tempDir) : '';

    let unspecifiedTempDir = !tempDir;
    if (unspecifiedTempDir) {
        tempDir = path.combine(modsDir, defaultTempDir);
    }

    let newModsDir = cl.get('f') || cl.get('folder');

    if (newModsDir) {

        if (typeof newModsDir == 'string') {
            modsDir = path.fix(newModsDir);

            if (unspecifiedTempDir) {
                tempDir = path.combine(modsDir, defaultTempDir);
            }
        }
        else {
            print.warn(`Couldn't set mods folder "${newModsDir}""`);
        }
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

function _getGameNumber(gameNumber) {
    let newGameNumber = cl.get('g') || cl.get('game');

    if (newGameNumber !== undefined) {
        gameNumber = newGameNumber;
    }

    gameNumber = Number(gameNumber);

    if (gameNumber !== 1 && gameNumber !== 2) {
        throw new Error(`Vermintide ${gameNumber} hasn't been released yet. Check your ${values.filename}.`);
    }

    console.log(`Game: Vermintide ${gameNumber}`);

    return gameNumber;
}

function _getTemplateDir(templateDir) {
    let newTemplateDir = cl.get('template') || '';

    if (newTemplateDir && typeof newTemplateDir == 'string') {
        return path.absolutify(newTemplateDir, values.exeDir);
    }

    return path.absolutify(templateDir, values.exeDir);
}

function _getTemplateSrc(configCoreSrc, templateDir) {

    // Static files from config
    let coreSrc = [
        path.combine(templateDir, values.itemPreview)
    ];

    if (Array.isArray(configCoreSrc)) {

        for (let src of configCoreSrc) {
            coreSrc.push(path.combine(templateDir, src));
        };
    }

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
