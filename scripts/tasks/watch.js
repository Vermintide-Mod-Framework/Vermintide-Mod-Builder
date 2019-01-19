
const print = require('../print');

const watch = require('../lib/glob-debounced-watch');
const path = require('../lib/path');

const config = require('../modules/config');

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

    let isBuilding = false;
    let buildQueue = [];

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
        let src = [modDir];

        let ignoredSrc = [
            // Ignore temp files stingray creates
            modDir + '/*.tmp'
        ];

        // Ignore folders with built files
        for (let bundleDir of bundleDirs) {
            ignoredSrc.push(bundleDir + '/**');
        }

        for (let ignoredDir of config.get('ignoredDirsPerMod')) {
            ignoredDir = path.combine(modDir, ignoredDir);
            ignoredSrc.push(ignoredDir + '/**');
        }

        for (let pattern of ignoredSrc) {
            console.log(`   Ignoring "${pattern}"`);
            src.push('!' + pattern);
        }

        let options = {};

        // watch module doesn't ignore dot files by default
        if(!config.get('includeDotFiles')) {
            options.ignored = /(^|[\/\\])\../;
        }

        watch(src, options, async (callback) => {

            buildQueue.push(modName);

            if(!isBuilding) {
                await buildQueuedMods();
            }

            callback();
        });
    };

    async function buildQueuedMods() {
        isBuilding = true;

        while(buildQueue.length > 0) {
            await buildMod(buildQueue.shift());
        }

        isBuilding = false;
    }

    async function buildMod(modName) {
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
    }

    return { exitCode, finished: false };
};
