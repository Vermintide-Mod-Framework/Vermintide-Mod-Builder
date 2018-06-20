const vdf = require('vdf');
const crypto = require('crypto');

const print = require('../print');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const reg = require('../lib/reg');

const config = require('../modules/config');
const cfg = require('../modules/cfg');
const cl = require('../modules/cl');

async function validateModNames(modNames, cfgMustExist) {

    let modInfo = [];

    for (let modName of modNames) {

        if (!modName) {
            continue;
        }

        let modDir = getModDir(modName);

        let error = '';
        let cfgExists = await cfg.fileExists(modName);

        if (!validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (!await pfs.accessible(modDir + '/')) {
            error = `Folder "${modDir}" doesn't exist`;
        }
        else if (!cfgExists && cfgMustExist) {
            error = `${cfg.getBase()} not found in "${cfg.getDir(modName)}"`;
        }

        modInfo.push({ modName, modDir, cfgExists, error });
    };

    return modInfo;
}

function validModName(modName) {
    return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- %]+$/);
}

async function getModId(modName) {

    let cfgData;
    try {
        cfgData = await cfg.readFile(modName);
    }
    catch(error) {
        throw new Error(`${cfg.getBase()} not found in ${cfg.getDir(modName)}`);
    }

    let modId = cfg.getValue(cfgData, 'published_id', 'number');

    if (typeof modId != 'string') {
        throw new Error(
            `Item ID not found in "${cfg.getPath(modName)}".\n` +
            `You need to publish your mod to workshop before you can build/view it.\n` +
            `Alternatively, you can specify the workshop item id with --id param.`
        );
    }

    return modId;
}

async function getSteamAppsDir(appId){

    let appKey = 'HKEY_CURRENT_USER\\Software\\Valve\\Steam';
    let value = 'SteamPath';
    let steamDir;

    try {
        steamDir = await reg.get(appKey, value);
    }
    catch (err) {
        throw new Error(`${err}\nSteam installation directory not found`);
    }

    let appManifestName = `appmanifest_${appId}.acf`;
    let steamAppsDir = path.combine(steamDir, 'SteamApps');

    if (await pfs.accessible(path.combine(steamAppsDir, appManifestName))) {
        return steamAppsDir;
    }

    let vdfName = 'libraryfolders.vdf';
    let data;

    try {
        data = vdf.parse(await pfs.readFile(path.combine(steamAppsDir, 'libraryfolders.vdf'), 'utf-8'));
    }
    catch (err) {
        throw new Error(`${err}\nCoudln't parse ${vdfName}`);
    }

    if (!data.LibraryFolders) {
        throw new Error(`Coudln't parse ${vdfName}`);
    }

    let i = 0;
    while(++i) {
        let libraryDir = data.LibraryFolders[String(i)];

        if(!libraryDir) {
            break;
        }

        steamAppsDir = path.combine(libraryDir, 'SteamApps');
        if (await pfs.accessible(path.combine(steamAppsDir, appManifestName))) {
            return steamAppsDir;
        }
    }

    throw new Error(`SteamApps folder for app ${appId} not found`);
}

async function getAppDir(appId) {
    let steamAppsDir = await getSteamAppsDir(appId);
    let appManifestName = `appmanifest_${appId}.acf`;
    let data;

    try {
        data = vdf.parse(await pfs.readFile(path.combine(steamAppsDir, appManifestName), 'utf-8'));
    }
    catch (err) {
        throw new Error(`${err}\nCoudln't parse ${appManifestName}`);
    }

    let installDir;
    try {
        installDir = data.AppState.installdir;
    }
    catch (err) {
        throw new Error(`Coudln't parse ${appManifestName}`);
    }

    return path.combine(steamAppsDir, 'common', installDir);
}

// Gets mod tools placement from Vermintide Mod Tools install location
async function getModToolsDir() {

    let toolsDir;

    if (config.get('useFallback')) {
        console.log(`Using fallback mod tools folder.`);
    }
    else{

        try {
            toolsDir = await getAppDir(config.get('toolsId'));
        }
        catch (err) {
            print.error(err);
        }

        if (!toolsDir || typeof toolsDir != 'string') {
            print.error('Vermintide mod SDK folder not found, using fallback.');
        }
    }

    if (!toolsDir) {
        toolsDir = config.get('fallbackToolsDir');
    }

    if (!await pfs.accessible(path.combine(toolsDir, config.get('stingrayDir'), config.get('stingrayExe')))) {

        throw new Error(
            `Mod tools not found in "${toolsDir}".\n` +
            `You need to install Vermintide Mod Tools from Steam client or specify a valid fallback path.`
        );
    }

    console.log(`Mod tools folder "${toolsDir}"`);
    return toolsDir;
}

// Gets the steam workshop folder from vermintide's install location
async function getWorkshopDir() {
    let gameId = config.get('gameId');

    let steamAppsDir;

    if (config.get('useFallback')) {
        console.log(`Using fallback SteamApps folder.`);
    }
    else {

        try {
            steamAppsDir = await getSteamAppsDir(gameId);
        }
        catch (err) {
            print.error(err);
        }

        if (!steamAppsDir || typeof steamAppsDir != 'string') {
            print.error('SteamApps folder not found, using fallback.');
        }
    }

    if (!steamAppsDir) {
        steamAppsDir = config.get('fallbackSteamAppsDir');
    }

    if (!await pfs.accessible(steamAppsDir)) {
        throw new Error(`SteamApps folder "${steamAppsDir}" not found.\nYou need to specify a valid fallback path.`);
    }

    steamAppsDir = path.combine(steamAppsDir, 'workshop/content', gameId);
    console.log(`Workshop folder ${steamAppsDir}`);
    return steamAppsDir;
}

function getModDir(modName) {
    return path.combine(config.get('modsDir'), modName);
}

function getTempDir(modName) {
    return path.combine(config.get('tempDir'), `${modName}V${config.get('gameNumber')}`);
}

async function getBundleDir(modName) {
    let cfgData = await cfg.readFile(modName);

    let bundleDir = cfg.getValue(cfgData, 'content', 'string');
    if(typeof bundleDir != 'string') {
        throw new Error(`No 'content' value specified in "${cfg.getPath(modName)}"`);
    }

    return path.absolutify(path.fix(bundleDir), getModDir(modName));
}

function getDefaultBundleDir(modName) {
    return path.absolutify(config.get('defaultBundleDir'), getModDir(modName));
}

// Returns an object with all create/upload/publish params
function getWorkshopParams() {

    let modName = getFirstModName();
    let modTitle = cl.get('t') || cl.get('title') || modName;

    return {
        name: modName,
        title: modTitle,
        description: cl.get('d') || cl.get('desc') || cl.get('description') || modTitle + ' description',
        language: cl.get('l') || cl.get('language') || 'english',
        visibility: cl.get('v') || cl.get('visibility') || 'private',
        tags: cl.get('tags') || ''
    };
}

function getFirstModName() {
    let modName = cl.getPlainArgs()[0] || '';
    return modName;
}

async function getModNames() {
    let modNames = cl.getPlainArgs();

    if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
        try {
            modNames = await pfs.getDirs(config.get('modsDir'), config.get('ignoredDirs'));
        }
        catch (err) {
            print.error(err);
        }
    }

    return modNames;
}

// Returns an object with all build params
async function getBuildParams() {

    let verbose = cl.get('verbose') || false;
    let shouldRemoveTemp = cl.get('clean') || false;
    let modNames = await getModNames();

    let modId = modNames && modNames.length == 1 ? cl.get('id') : null;
    let makeWorkshopCopy = !cl.get('no-workshop');
    let ignoreBuildErrors = cl.get('e') || cl.get('ignore-errors') || cl.get('ignore-build-errors') || config.get('ignoreBuildErrors');

    return { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors };
}

function getModFilePath(modName) {
    return path.combine(getModDir(modName), modName + config.get('modFileExtension'));
}

function hashModName(data) {
    data = String(data).toLowerCase();
    var hash = crypto.createHash('md5').update(data, 'utf-8').digest('hex');
    return hash.substring(0, 16);
}


exports.validateModNames = validateModNames;
exports.validModName = validModName;
exports.getModId = getModId;
exports.getSteamAppsDir = getSteamAppsDir;
exports.getAppDir = getAppDir;
exports.getModToolsDir = getModToolsDir;
exports.getWorkshopDir = getWorkshopDir;
exports.getModDir = getModDir;
exports.getTempDir = getTempDir;
exports.getBundleDir = getBundleDir;
exports.getDefaultBundleDir = getDefaultBundleDir;
exports.getModFilePath = getModFilePath;
exports.hashModName = hashModName;

exports.getWorkshopParams = getWorkshopParams;
exports.getFirstModName = getFirstModName;
exports.getModNames = getModNames;
exports.getBuildParams = getBuildParams;
