
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const reg = require('./lib/reg');
const crypto = require('crypto');
const vdf = require('vdf');

let modTools = {
    validModName(modName) {
        return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- %]+$/);
    },

    async getModId(modName) {
        let cfgData = await pfs.readFile(path.combine(config.modsDir, modName, config.cfgFile), 'utf8');
        let modId = cfgData.match(/^published_id *=? *(\d*)\D*$/m);
        modId = modId && modId[1];

        if (!modId) {
            throw (
                `Item ID not found in ${config.cfgFile} file.\n` +
                `You need to publish your mod to workshop before you can build/view it.\n` +
                `Alternatively you can specify the workshop item id with --id param.`
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
            throw `${err}\nSteam installation directory not found`;
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
            throw `${err}\nCoudln't parse ${vdfName}`;
        }

        if (!data.LibraryFolders) {
            throw `Coudln't parse ${vdfName}`;
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

        throw `SteamApps folder for app ${appId} not found`;
    },

    async getAppDir(appId) {
        let steamAppsDir = await modTools.getSteamAppsDir(appId);
        let appManifestName = `appmanifest_${appId}.acf`;
        let data;

        try {
            data = vdf.parse(await pfs.readFile(path.combine(steamAppsDir, appManifestName), 'utf-8'));
        }
        catch (err) {
            throw `${err}\nCoudln't parse ${appManifestName}`;
        }

        let installDir;
        try {
            installDir = data.AppState.installdir;
        }
        catch (err) {
            throw `Coudln't parse ${appManifestName}`;
        }

        return path.combine(steamAppsDir, 'common', installDir);
    },

    // Gets mod tools placement from Vermintide Mod Tools install location
    async getModToolsDir() {

        let toolsDir;

        if (config.useFallback) {
            console.log(`Using fallback mod tools folder.`);
        }
        else{
            try {
                toolsDir = await modTools.getAppDir(config.toolsId);
            }
            catch (err) {
                console.log(err);
            }

            if (!toolsDir || typeof toolsDir != 'string') {
                console.error('Vermintide mod SDK folder not found, using fallback.');
            }
        }

        if (!toolsDir) {
            toolsDir = config.fallbackToolsDir;
        }

        if (!await pfs.accessible(path.combine(toolsDir, config.stingrayDir, config.stingrayExe))) {
            throw `Mod tools not found in "${toolsDir}".\nYou need to install Vermintide Mod Tools from Steam client or specify a valid fallback path.`;
        }
        console.log(`Mod tools folder "${toolsDir}"`);
        return toolsDir;
    },

    // Gets the steam workshop folder from vermintide's install location
    async getWorkshopDir() {
        let gameId = config.gameId;

        let steamAppsDir;

        if (config.useFallback) {
            console.log(`Using fallback SteamApps folder.`);
        }
        else {
            try {
                steamAppsDir = await modTools.getSteamAppsDir(gameId);
            }
            catch (err) {
                console.log(err);
            }

            if (!steamAppsDir || typeof steamAppsDir != 'string') {
                console.error('SteamApps folder not found, using fallback.');
            }
        }

        if (!steamAppsDir) {
            steamAppsDir = config.fallbackSteamAppsDir;
        }

        if (!await pfs.accessible(steamAppsDir)) {
            throw `SteamApps folder "${steamAppsDir}" not found.\nYou need to specify a valid fallback path.`;
        }

        steamAppsDir = path.combine(steamAppsDir, 'workshop/content', gameId);
        console.log(`Workshop folder ${steamAppsDir}`);
        return steamAppsDir;
    },

    hashModName(data) {
        data = String(data).toLowerCase();
        var hash = crypto.createHash('md5').update(data, 'utf-8').digest('hex');
        return hash.substring(0, 16);
    }
};

module.exports = modTools;
