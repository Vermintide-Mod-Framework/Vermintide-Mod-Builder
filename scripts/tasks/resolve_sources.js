const print = require('../print');

const modTools = require('../tools/mod_tools');
const builder = require('../tools/builder');
const sources = require('../tools/sources');

// Finds the files each mod uses from source_dirs and writes them to its sources.txt, which vmb build then copies
module.exports = async function taskResolveSources() {

    let exitCode = 0;

    let modNames = await modTools.getModNames();
    if (modNames.length === 0) {
        console.log(`No mods to resolve`);
        return { exitCode, finished: true };
    }

    for (let { modName, modDir, error } of await modTools.validateModNames(modNames, false)) {

        if (error) {
            print.error(`\n${error}`);
            exitCode = 1;
            continue;
        }

        try {
            // The bundle folders are not the mod's sources
            let bundleDir;
            try {
                bundleDir = await modTools.getBundleDir(modName);
            }
            catch (error) {
                bundleDir = modTools.getDefaultBundleDir(modName);
            }
            let { bundleDirs } = await builder.getRelevantCfgParams(modName, bundleDir);

            let { listFile, count } = await sources.resolve(modDir, bundleDirs);
            console.log(`${modName}: ${count} files from source_dirs, listed in "${listFile}"`);
        }
        catch (error) {
            print.error(error);
            exitCode = 1;
        }
    }

    return { exitCode, finished: true };
};
