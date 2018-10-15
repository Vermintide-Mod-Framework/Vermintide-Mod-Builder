const opn = require('opn');

const print = require('../print');

const pfs = require('../lib/pfs');

const cfg = require('../modules/cfg');
const config = require('../modules/config');

const modTools = require('../tools/mod_tools');
const uploader = require('../tools/uploader');
const templater = require('../tools/templater');

module.exports = async function taskCreate() {

    let exitCode = 0;

    let params = modTools.getWorkshopParams();
    let modName = params.name;
    let modDir = modTools.getModDir(modName);

    // Validate modName
    let error = '';
    if (!modTools.validModName(modName)) {
        error = `Folder name "${modDir}" is invalid`;
    }
    else if (await pfs.accessibleDir(modDir)) {
        error = `Folder "${modDir}" already exists`;
    }

    if (error) {
        print.error(new Error(error));
        return { exitCode: 1, finished: true };
    }

    try {

        // Copy and customize template
        console.log(`Copying template from "${config.get('templateDir')}"`);
        await templater.copyTemplate(params);

        // Copy placeholder bundle or .mod file depending on format used
        if (config.get('useNewFormat')) {
            await templater.createPlaceholderModFile(modName, params.content);
        }
        else {
            await templater.createPlaceholderBundle(modName, params.content);
        }

        // Create .cfg file
        params.filePath = cfg.getPath(modName);
        await cfg.writeFile(params);

        // Get path tosdk and upload mod
        let modId = await uploader.uploadMod(await modTools.getModToolsDir(), modName);

        // Print and optionally open url if -o flag was set
        let modUrl = uploader.formUrl(modId);
        let modSteamUrl = uploader.formSteamUrl(modId);
        console.log(`Now you need to subscribe to ${modUrl} in order to be able to build and test your mod.`);
        console.log(`Opening url...`);
        await opn(modSteamUrl);
    }
    catch (error) {
        print.error(error);
        exitCode = 1;

        // Cleanup directory if it has been created
        let modDir = modTools.getModDir(modName);
        if (await pfs.accessibleDir(modDir)) {

            try {
                await pfs.deleteDirectory(modDir);
            }
            catch (error) {
                print.error(error);
            }
        }
    }

    return { exitCode, finished: true };
};
