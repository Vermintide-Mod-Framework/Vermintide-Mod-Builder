const pfs = require('../lib/pfs');
const path = require('../lib/path');
const opn = require('opn');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const buildMod = require('../builder');
const uploader = require('../uploader');
const templater = require('../templater');
const cfg = require('../cfg');

module.exports = async function taskPublish() {

    let exitCode = 0;

    let params = cl.getWorkshopParams();
    let modName = params.name;
    let modDir = path.combine(config.get('modsDir'), modName);
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
            await templater.validateTemplate(config.get('templateDir'));
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
        let cfgData = await cfg.readFile(modName);

        if (cfg.getValue(cfgData, 'published_id', 'number')){

            console.error(
                `Mod has already been published for Vermintide ${config.get('gameNumber')} with item cfg "${cfg.getPath(modName)}".\n` +
                `Use 'vmb upload' or specify a different item cfg file with --cfg instead.`
            );

            return { exitCode: 1, finished: true };
        }

        console.log(`Using existing ${cfg.getBase()}`);
    }
    catch (error) {

        try {
            await cfg.writeFile(params);
        }
        catch (error) {
            console.error(error);
            return { exitCode: 1, finished: true };
        }

    }

    try {

        let toolsDir = await modTools.getModToolsDir();
        await buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, false, params.verbose, buildParams.ignoreBuildErrors, null);

        console.log();
        await pfs.copyIfDoesntExist(path.combine(config.get('templateDir'), config.get('itemPreview')), path.combine(modDir, config.get('itemPreview')));
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
