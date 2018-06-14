
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const reg = require('./lib/reg');
const crypto = require('crypto');
const vdf = require('vdf');
const cfg = require('./cfg');
const print = require('./print');

let modTools = {

    async validateModNames(modNames, cfgMustExist) {

        let modInfo = [];

        for (let modName of modNames) {

            if (!modName) {
                continue;
            }

            let modDir = modTools.getModDir(modName);

            let error = '';
            let cfgExists = await cfg.fileExists(modName);

            if (!modTools.validModName(modName)) {
                error = `Folder name "${modDir}" is invalid`;
            }
            else if (!await pfs.accessible(modDir + '/')) {
                error = `Folder "${modDir}" doesn't exist`;
            }
            else if (!cfgExists && cfgMustExist) {
                error = `${cfg.getBase()} not found in "${cfg.getDir(modDir)}"`;
            }

            modInfo.push({ modName, modDir, cfgExists, error });
        };

        return modInfo;
    },

    validModName(modName) {
        return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- %]+$/);
    },

    async getModId(modName) {

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
    },

    async getSteamAppsDir(appId){

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
    },

    async getAppDir(appId) {
        let steamAppsDir = await modTools.getSteamAppsDir(appId);
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
    },

    // Gets mod tools placement from Vermintide Mod Tools install location
    async getModToolsDir() {

        let toolsDir;

        if (config.get('useFallback')) {
            console.log(`Using fallback mod tools folder.`);
        }
        else{

            try {
                toolsDir = await modTools.getAppDir(config.get('toolsId'));
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
    },

    // Gets the steam workshop folder from vermintide's install location
    async getWorkshopDir() {
        let gameId = config.get('gameId');

        let steamAppsDir;

        if (config.get('useFallback')) {
            console.log(`Using fallback SteamApps folder.`);
        }
        else {

            try {
                steamAppsDir = await modTools.getSteamAppsDir(gameId);
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
    },

    getModDir(modName) {
        return path.combine(config.get('modsDir'), modName);
    },

    getTempDir(modName) {
        return path.combine(config.get('tempDir'), `${modName}V${config.get('gameNumber')}`);
    },

    async getBundleDir(modName) {
        let cfgData = await cfg.readFile(modName);

        let bundleDir = cfg.getValue(cfgData, 'content', 'string');
        if(typeof bundleDir != 'string') {
            throw new Error(`No 'content' value specified in "${cfg.getPath(modName)}"`);
        }

        return path.absolutify(path.fix(bundleDir), modTools.getModDir(modName));
    },

    getDefaultBundleDir(modName) {
        return path.absolutify(config.get('defaultBundleDir'), modTools.getModDir(modName));
    },

    hashModName(data) {
        data = String(data).toLowerCase();
        var hash = crypto.createHash('md5').update(data, 'utf-8').digest('hex');
        return hash.substring(0, 16);
    }
};

module.exports = modTools;
