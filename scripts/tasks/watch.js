const watcher = require('glob-watcher');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const buildMod = require('../builder');

module.exports = async function watchTask() {

    let exitCode = 0;

    let { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams();

    if (modNames.length === 0) {
        console.log(`No mods to watch`);
        return { exitCode, finished: true };
    }

    let toolsDir;
    try {
        toolsDir = await modTools.getModToolsDir();
    }
    catch (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    };

    console.log();

    for (let { modName, modDir, error } of await modTools.validateModNames(modNames, false)) {

        if (error) {
            console.error(error);
            exitCode = 1;
            continue;
        }

        console.log(`Watching ${modName}...`);

        let src = [
            modDir,
            '!' + config.get('modsDir') + '/' + modName + '/*.tmp',
            '!' + config.get('modsDir') + '/' + modName + '/' + config.get('bundleDir') + '/*'
        ];

        watcher(src, async (callback) => {

            try {
                await buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId);
            }
            catch (error) {
                console.error(error);
                exitCode = 1;
            };

            callback();
        });
    };

    return { exitCode, finished: false };
};
