const watch = require('glob-watcher');

const print = require('../print');

const modTools = require('../tools/mod_tools');
const builder = require('../tools/builder');

module.exports = async function taskWatch() {

    let exitCode = 0;

    let { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors, copySource } = await modTools.getBuildParams();

    if (modNames.length === 0) {
        console.log(`No mods to watch`);
        return { exitCode, finished: true };
    }

    // Get path to sdk
    let toolsDir;
    try {
        toolsDir = await modTools.getModToolsDir();
    }
    catch (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    };

    console.log();

    for (let { modName, modDir, error } of await modTools.validateModNames(modNames, makeWorkshopCopy && !modId)) {

        if (error) {
            print.error(error);
            exitCode = 1;
            continue;
        }

        console.log(`Watching ${modName}...`);

        // Determine where built mod is gonna be put
        let bundleDir;
        try {
            bundleDir = await modTools.getBundleDir(modName);
        }
        catch (error) {
            bundleDir = modTools.getDefaultBundleDir(modName);
        }

        let { bundleDirs } = await builder.getRelevantCfgParams(modName, bundleDir);

        // These files will be watched
        let src = [
            modDir,

            // Ignore temp files stingray creates
            '!' + modDir + '/*.tmp'
        ];

        // Ignore folders with built files
        for (let bundleDir of bundleDirs) {
            src.push('!' + bundleDir + '/**');
        }

        watch(src, async (callback) => {

            try {
                await builder.buildMod(toolsDir, modName, {
                    shouldRemoveTemp,
                    makeWorkshopCopy,
                    verbose,
                    ignoreBuildErrors,
                    modId,
                    copySource
                });
            }
            catch (error) {
                print.error(error);
                exitCode = 1;
            };

            callback();
        });
    };

    return { exitCode, finished: false };
};
