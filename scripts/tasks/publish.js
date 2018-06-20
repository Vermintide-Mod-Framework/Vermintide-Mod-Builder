const opn = require('opn');

const print = require('../print');

const pfs = require('../lib/pfs');
const path = require('../lib/path');

const cfg = require('../modules/cfg');
const config = require('../modules/config');

const modTools = require('../tools/mod_tools');
const builder = require('../tools/builder');
const uploader = require('../tools/uploader');
const templater = require('../tools/templater');

module.exports = async function taskPublish() {

    let exitCode = 0;

    // Publish and build params
    let params;
    let buildParams = await modTools.getBuildParams();

    // Make sure that params are valid and mod hasn't been published already
    try {
        params = await _getPublishParams(params);

        // Validate template - we'll be copying image preview from it
        await templater.validateTemplate(config.get('templateDir'));
    }
    catch (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    let modName = params.name;
    let modDir = modTools.getModDir(modName);

    try {

        // Get path to sdk
        let toolsDir = await modTools.getModToolsDir();

        // Build mod
        await builder.buildMod(toolsDir, modName, {
            shouldRemoveTemp: buildParams.shouldRemoveTemp,
            makeWorkshopCopy: false,
            verbose: buildParams.verbose,
            ignoreBuildErrors: buildParams.ignoreBuildErrors,
            modId: null
        });

        console.log();

        // Copy item preview file if it doesn't exist so that uploading works
        await pfs.copyIfDoesntExist(
            path.combine(config.get('templateDir'), config.get('itemPreview')),
            path.combine(modDir, params.itemPreview)
        );

        // Upload mod
        await uploader.uploadMod(toolsDir, modName);

        // Print and open mod url
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

// Gets and validates publising params based on workshop uploading params
async function _getPublishParams() {

    // Get workshop uploading params
    let params = modTools.getWorkshopParams();

    // Default item preview image file name - we need it so uploading works
    params.itemPreview = config.get('itemPreview');

    let modName = params.name;
    let modDir = modTools.getModDir(modName);

    // Validate mod name
    if (!modTools.validModName(modName)) {
        throw new Error(`Folder name "${modDir}" is invalid`);
    }

    // Make sure mod folder exists
    if (!await pfs.accessible(modDir + '/')) {
        throw new Error(`Folder "${modDir}" doesn't exist`);
    }

    // Read .cfg file if it exists, or create it based on params
    let cfgData = '';
    try {
        cfgData = await cfg.readFile(modName);
    }
    catch (error) {
        await cfg.writeFile(params);
    }

    if (cfgData) {

        // Take image preview file name from .cfg
        params.itemPreview = cfg.getValue(cfgData, 'preview', 'string') || params.itemPreview;

        // Check if mod has been published already
        if (cfg.getValue(cfgData, 'published_id', 'number')) {

            throw new Error(
                `Mod has already been published with item cfg "${cfg.getPath(modName)}".\n` +
                `Use 'vmb upload' or specify a different item cfg file with --cfg instead.`
            );
        }

        console.log(`Using existing ${cfg.getBase()}. Command line arguments will be ignored.`);
    }

    return params;
}
