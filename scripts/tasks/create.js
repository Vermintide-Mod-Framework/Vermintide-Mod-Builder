const pfs = require('../lib/pfs');
const opn = require('opn');
const cl = require('../cl');
const config = require('../config');
const print = require('../print');

const modTools = require('../mod_tools');
const uploader = require('../uploader');
const templater = require('../templater');
const cfg = require('../cfg');

module.exports = async function taskCreate() {

    let exitCode = 0;

    let params = cl.getWorkshopParams();
    let modName = params.name;
    let modDir = modTools.getModDir(modName);

    let error = '';
    if (!modTools.validModName(modName)) {
        error = `Folder name "${modDir}" is invalid`;
    }
    else if (await pfs.accessible(modDir + '/')) {
        error = `Folder "${modDir}" already exists`;
    }

    if (error) {
        print.error(new Error(error));
        return { exitCode: 1, finished: true };
    }

    console.log(`Copying template from "${config.get('templateDir')}"`);

    try {
        await templater.copyTemplate(params);
        await templater.copyPlaceholderBundle(params.name);
        await cfg.writeFile(params);

        let modId = await uploader.uploadMod(await modTools.getModToolsDir(), modName);

        let modUrl = uploader.formUrl(modId);
        console.log(`Now you need to subscribe to ${modUrl} in order to be able to build and test your mod.`);
        console.log(`Opening url...`);
        await opn(modUrl);
    }
    catch (error) {
        print.error(error);
        exitCode = 1;

        // Cleanup directory if it has been created
        let modDir = modTools.getModDir(modName);
        if (await pfs.accessible(modDir)) {
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
