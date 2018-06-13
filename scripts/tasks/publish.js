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
    let buildParams = await cl.getBuildParams();

    try {
        await _validateParams(params);
    }
    catch (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    }

    let modName = params.name;
    let modDir = path.combine(config.get('modsDir'), modName);

    try {

        let toolsDir = await modTools.getModToolsDir();
        await buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, false, params.verbose, buildParams.ignoreBuildErrors, null);

        console.log();
        await pfs.copyIfDoesntExist(
            path.combine(config.get('templateDir'), config.get('itemPreview')),
            path.combine(modDir, config.get('itemPreview'))
        );
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

async function _validateParams(params) {

    let modName = params.name;
    let modDir = path.combine(config.get('modsDir'), modName);

    if (!modTools.validModName(modName)) {
        throw new Error(`Folder name "${modDir}" is invalid`);
    }

    if (!await pfs.accessible(modDir + '/')) {
        throw new Error(`Folder "${modDir}" doesn't exist`);
    }

    await templater.validateTemplate(config.get('templateDir'));

    let cfgData = '';
    try {
        cfgData = await cfg.readFile(modName);
    }
    catch (error) {
        await cfg.writeFile(params);
    }

    if (cfgData) {

        if (cfg.getValue(cfgData, 'published_id', 'number')) {

            throw new Error(
                `Mod has already been published for Vermintide ${config.get('gameNumber')} with item cfg "${cfg.getPath(modName)}".\n` +
                `Use 'vmb upload' or specify a different item cfg file with --cfg instead.`
            );
        }

        console.log(`Using existing ${cfg.getBase()}`);
    }
}
