const pfs = require('../lib/pfs');
const path = require('../lib/path');
const opn = require('opn');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const buildMod = require('../builder');
const uploader = require('../uploader');
const templater = require('../templater');

module.exports = async function publishTask() {

    let exitCode = 0;

    let params = cl.getWorkshopParams();
    let modName = params.name;
    let modDir = path.combine(config.modsDir, modName);
    let buildParams = await cl.getBuildParams();

    let error = '';
    if (!modTools.validModName(modName)) {
        error = `Folder name "${modDir}" is invalid`;
    }
    else if (!await pfs.accessible(modDir + '/')) {
        error = `Folder "${modDir}" doesn't exist`;
    }
    else {
        try {
            await templater.validateTemplate(config.templateDir);
        }
        catch (err) {
            error = err;
        }
    }

    if (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    }

    try {
        if (await uploader.cfgExists(modName)) {
            console.log(`Using existing ${config.cfgFile}`);
        }
        else {
            await uploader.createCfgFile(params);
        }

        let toolsDir = await modTools.getModToolsDir();
        await buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, false, params.verbose, buildParams.ignoreBuildErrors, null);

        console.log();
        await pfs.copyIfDoesntExist(path.combine(config.templateDir, config.itemPreview), path.combine(modDir, config.itemPreview));
        await uploader.uploadMod(toolsDir, modName);

        let modId = await modTools.getModId(modName);
        let modUrl = uploader.formUrl(modId);
        console.log(`Uploaded to ${modUrl}`);
        console.log(`Opening url...`);
        await opn(modUrl);
    }
    catch (error) {
        console.error(error);
        exitCode = 1;
    }

    return { exitCode, finished: true };
};
