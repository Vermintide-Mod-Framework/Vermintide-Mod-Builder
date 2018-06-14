const opn = require('opn');

const pfs = require('../lib/pfs');
const path = require('../lib/path');

const cfg = require('../cfg');
const config = require('../config');
const print = require('../print');

const modTools = require('../tools/mod_tools');
const buildMod = require('../tools/builder');
const uploader = require('../tools/uploader');
const templater = require('../tools/templater');

module.exports = async function taskPublish() {

    let exitCode = 0;

    let params = modTools.getWorkshopParams();
    let buildParams = await modTools.getBuildParams();

    try {
        await _validateParams(params);
    }
    catch (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    let modName = params.name;
    let modDir = modTools.getModDir(modName);

    try {

        let toolsDir = await modTools.getModToolsDir();
        await buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, false, buildParams.verbose, buildParams.ignoreBuildErrors, null);

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
        print.error(error);
        exitCode = 1;
    }

    return { exitCode, finished: true };
};

async function _validateParams(params) {

    let modName = params.name;
    let modDir = modTools.getModDir(modName);

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
                `Mod has already been published with item cfg "${cfg.getPath(modName)}".\n` +
                `Use 'vmb upload' or specify a different item cfg file with --cfg instead.`
            );
        }

        console.log(`Using existing ${cfg.getBase()}`);
    }
}
