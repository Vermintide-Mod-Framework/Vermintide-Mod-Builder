const gulp = require('gulp');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const builder = require('../builder');

module.exports = async function watchTask() {

    let exitCode = 0;

    let { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams();

    if (modNames.length === 0) {
        console.log(`No mods to watch`);
        return { exitCode, finished: true };
    }

    let toolsDir = await modTools.getModToolsDir().catch((error) => {
        console.error(error);
        exitCode = 1;
    });

    if (toolsDir) {
        console.log();

        await builder.forEachMod(
            modNames,
            makeWorkshopCopy,
            (modName, modDir) => {
                console.log(`Watching ${modName}...`);

                let src = [
                    modDir,
                    '!' + config.modsDir + '/' + modName + '/*.tmp',
                    '!' + config.modsDir + '/' + modName + '/' + config.bundleDir + '/*'
                ];

                gulp.watch(src, async () => {
                    try {
                        await builder.buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId);
                    }
                    catch (error) {
                        console.error(error);
                        exitCode = 1;
                    };
                });
            },
            (error) => {
                console.error(error);
                exitCode = 1;
            }
        );
    }

    return { exitCode, finished: false };
};
