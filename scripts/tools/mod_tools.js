const vdf = require('vdf');
const crypto = require('crypto');
const vinyl = require('vinyl-fs');
const rename = require('gulp-rename');

const print = require('../print');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const reg = require('../lib/reg');

const config = require('../modules/config');
const cfg = require('../modules/cfg');
const cl = require('../modules/cl');

// Checks an array of mod names, returns a new array
// that contains modName, modDir, whether mod has .cfg file and an error message
async function validateModNames(modNames, cfgMustExist) {

    let modInfo = [];

    for (let modName of modNames) {

        if (!modName) {
            continue;
        }

        let modDir = getModDir(modName);

        let error = '';
        let cfgPath = cfg.getPath(modName);
        let cfgExists = await pfs.accessibleFile(cfgPath);

        if (!validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (!await pfs.accessibleDir(modDir)) {
            error = `Folder "${modDir}" doesn't exist`;
        }
        else if (!cfgExists && cfgMustExist) {
            error = `${cfg.getBase()} not found in "${cfg.getDir(modName)}"`;
        }

        modInfo.push({ modName, modDir, cfgExists, error });
    };

    return modInfo;
}

// Returns whether mod name is valid
function validModName(modName) {
    return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- %]+$/);
}

// Gets workshop item id from .cfg file
async function getModId(modName) {

    // Read .cfg file
    let cfgData;
    let cfgPath = cfg.getPath(modName);
    try {
        cfgData = await cfg.readFile(cfgPath);
    }
    catch(error) {
        throw new Error(`${cfg.getBase()} not found in ${cfg.getDir(modName)}`);
    }

    // Get id from .cfg file
    let modId = cfg.getValue(cfgData, 'published_id', 'number');

    if (typeof modId != 'string') {
        throw new Error(
            `Item ID not found in "${cfgPath}".\n` +
            `You need to publish your mod to workshop before you can work with it.\n` +
            `Alternatively, you can specify the workshop item id with --id param.`
        );
    }

    return modId;
}

async function legacyGetSteamAppsDir(libraryFolders, appManifestName) {
    let dir_i = 0;
    while(++dir_i) {
        const libraryDir = libraryFolders[String(dir_i)];

        if(!libraryDir) {
            break;
        }

        const steamAppsDir = path.combine(libraryDir, 'SteamApps');
        if (await pfs.accessibleFile(path.combine(steamAppsDir, appManifestName))) {
            return steamAppsDir;
        }
    }
}

// Return steamapps folder path of a specific app
async function getSteamAppsDir(appId){

    let appKey = 'HKEY_CURRENT_USER\\Software\\Valve\\Steam';
    let value = 'SteamPath';
    let steamDir;

    // Find steam installation directory in win registry
    try {
        steamDir = await reg.get(appKey, value);
    }
    catch (err) {
        throw new Error(`${err}\nSteam installation directory not found`);
    }

    let appManifestName = `appmanifest_${appId}.acf`;
    let steamAppsDir = path.combine(steamDir, 'SteamApps');

    // Check if the main steam folder has a manifest file for the requested app in it
    if (await pfs.accessibleFile(path.combine(steamAppsDir, appManifestName))) {
        return steamAppsDir;
    }

    let vdfName = 'libraryfolders.vdf';
    
    // Read other steam library folders from libraryfolders.vdf
    let file;
    try {
        file = await pfs.readFile(path.combine(steamAppsDir, vdfName), 'utf-8');
    }
    catch (err) {
        throw new Error(`${err}\nCouldn't read ${vdfName}`);
    }
    
    let data;
    try {
        data = vdf.parse(file);
        pfs.close(file)
    } catch (err) {
        throw new Error(`${err}\nCouldn't parse ${vdfName}`);
    }

    // Check all other steam library folders for app's manifest file
    if(data.LibraryFolders) {
        const appsDir = await legacyGetSteamAppsDir(data.LibraryFolders, appManifestName)
        if(appsDir) {
            return appsDir
        }
    } else if(data.libraryfolders) {
        let dir_i = 0;
        while(++dir_i) {
            const libraryDirData = data.libraryfolders[String(dir_i)];

            if(!libraryDirData) {
                break;
            }

            const libraryDir = libraryDirData.path
            const steamAppsDir = path.combine(libraryDir, 'SteamApps');
            if (await pfs.accessibleFile(path.combine(steamAppsDir, appManifestName))) {
                return steamAppsDir;
            }
        }
    } else {
        throw new Error(`Missing key (LibraryFolders|libraryfolders) in ${vdfName}. Found keys: [${Object.keys(data).join(", ")}]`);
    }

    throw new Error(`SteamApps folder for app ${appId} not found`);
}

// Returns the folder of a steam app
async function getAppDir(appId) {

    // Find in which steamapps folder the app manifest file is
    let steamAppsDir = await getSteamAppsDir(appId);

    let appManifestName = `appmanifest_${appId}.acf`;
    let data;

    // Read and parse app manifest file
    try {
        data = vdf.parse(await pfs.readFile(path.combine(steamAppsDir, appManifestName), 'utf-8'));
    }
    catch (err) {
        throw new Error(`${err}\nCoudln't parse ${appManifestName}`);
    }

    // Get intall dir name from app manifest data
    let installDir;
    try {
        installDir = data.AppState.installdir;
    }
    catch (err) {
        throw new Error(`Coudln't parse ${appManifestName}`);
    }

    // Return absolute path to app install dir
    return path.combine(steamAppsDir, 'common', installDir);
}

// Gets mod tools placement for current game from steam's intall location
async function getModToolsDir() {

    let toolsDir;

    if (config.get('useFallback')) {
        console.log(`Using fallback mod tools folder.`);
    }
    else{

        // Get app location
        try {
            toolsDir = await getAppDir(config.get('toolsId'));
        }
        catch (err) {
            print.error(err);
        }

        if (!toolsDir) {
            print.error('Vermintide mod SDK folder not found, using fallback.');
        }
    }

    // Use fallback path if no found
    if (!toolsDir) {
        toolsDir = config.get('fallbackToolsDir');
    }

    // Check that the path is correct by finding stingray exe inside the app
    if (!await pfs.accessibleFile(path.combine(toolsDir, config.get('stingrayDir'), config.get('stingrayExe')))) {

        throw new Error(
            `Mod tools not found in "${toolsDir}".\n` +
            `You need to install Vermintide Mod Tools from Steam client or specify a valid fallback path.`
        );
    }

    console.log(`Mod tools folder "${toolsDir}"`);
    return toolsDir;
}

// Gets workshop folder placement for the current game from steam's install location
async function getWorkshopDir() {
    let gameId = config.get('gameId');

    let steamAppsDir;

    if (config.get('useFallback')) {
        console.log(`Using fallback SteamApps folder.`);
    }
    else {

        // Get steamapps folder location
        try {
            steamAppsDir = await getSteamAppsDir(gameId);
        }
        catch (err) {
            print.error(err);
        }

        if (!steamAppsDir) {
            print.error('SteamApps folder not found, using fallback.');
        }
    }

    // Use fallback path if no found
    if (!steamAppsDir) {
        steamAppsDir = config.get('fallbackSteamAppsDir');
    }

    // Check that steamapps path is valid
    if (!await pfs.accessibleDir(steamAppsDir)) {
        throw new Error(`SteamApps folder "${steamAppsDir}" not found.\nYou need to specify a valid fallback path.`);
    }

    // workshop/content/gameId might not exist, so we append it after checking that the path is valid
    steamAppsDir = path.combine(steamAppsDir, 'workshop/content', gameId);
    console.log(`Workshop folder "${steamAppsDir}"`);
    return steamAppsDir;
}

// Returns modsDir/modName
function getModDir(modName) {
    return path.combine(config.get('modsDir'), modName);
}

// returns tempDir/modNameVgameNumber
function getTempDir(modName) {
    return path.combine(config.get('tempDir'), `${modName}V${config.get('gameNumber')}`);
}

// Gets bundle dir location from mod's .cfg file
async function getBundleDir(modName) {
    let cfgPath = cfg.getPath(modName);
    let cfgData = await cfg.readFile(cfgPath);
    let bundleDir = cfg.getMappedValue(cfgData, 'bundleDir', 'string');
    return path.absolutify(path.fix(bundleDir), getModDir(modName));
}

// Returns defaultBundleDir/modName
function getDefaultBundleDir(modName) {
    return path.absolutify(config.get('defaultBundleDir'), getModDir(modName));
}

// Returns an object with all create/upload/publish params
function getWorkshopParams() {

    let modName = getFirstModName();
    let modTitle = cl.get('t', 'title') || modName;

    return {
        name: modName,
        title: modTitle,
        description: cl.get('d', 'desc', 'description') || modTitle + ' description',
        language: cl.get('l', 'language') || 'english',
        visibility: cl.get('v', 'visibility') || 'private',
        content: cl.get('c', 'content'),
        tags: cl.get('tags') || ''
    };
}

// Returns first modName from command line params
function getFirstModName() {
    let modName = cl.getPlainArgs()[0] || '';
    return modName;
}

// Returns an array of mod names either from command line params or from scanning modDir folder
async function getModNames() {

    // Get mod names from cl params
    let modNames = cl.getPlainArgs();

    // No mod names in cl params
    if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
        try {
            modNames = await pfs.getDirs(config.get('modsDir'), config.get('ignoredDirs'));
        }
        catch (err) {
            modNames = [];
            print.error(err);
        }

        // Ignore folder names starting with .
        if(!config.get('includeDotFiles')) {
            modNames = modNames.filter((modName) => modName[0] != '.');
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
    let ignoreBuildErrors = cl.get('e', 'ignore-errors', 'ignore-build-errors');
    if (ignoreBuildErrors === undefined) {
        ignoreBuildErrors = config.get('ignoreBuildErrors');
    }

    let copySource = config.get('copySource');

    let useModCore = cl.get('useModCore', 'use-mod-core', 'core', 'c') || false;

    return { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors, copySource, useModCore};
}

// Returns modsDir/modName/modName.mod
function getModFilePath(modName) {
    return path.combine(getModDir(modName), modName + config.get('modFileExtension'));
}

// Returns first 16 chars from md5 hex hash of lower case converted modName
function hashModName(modName) {
    modName = String(modName).toLowerCase();
    var hash = crypto.createHash('md5').update(modName, 'utf-8').digest('hex');
    return hash.substring(0, 16);
}

// Returns the bundle's file stream and initiates the process of copying the bundle file to the buildDir
function bundleStreamer(extConfigName, buildDir, useNewFormat, modName, reject) {
    let gulp_array = [
        buildDir + '/*([0-f])',
        buildDir + '/*([0-f]).stream',
        '!' + buildDir + '/dlc'
    ]
    
    let bundleStream = vinyl.src(
        gulp_array,
        { base: buildDir })
        .pipe(rename(p => {

            if (!useNewFormat) {
                p.basename = hashModName(modName);
            }

            if (!p.extname){
                p.extname = config.get(extConfigName);
            }
        }))
        .on('error', reject);

    return bundleStream
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

exports.bundleStreamer = bundleStreamer;
