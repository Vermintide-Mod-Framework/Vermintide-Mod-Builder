const print = require('../print');

const modTools = require('../tools/mod_tools');
const builder = require('../tools/builder');

module.exports = async function taskBuild() {

    let exitCode = 0;

    let { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors } = await modTools.getBuildParams();

    // Only print what we're gonna build if there's more than one mod
    if (modNames.length > 1) {
        console.log(`Mods to build:`);
        for (let modName of modNames) {
            console.log(`  ${modName}`);
        }
    }
    else if(modNames.length === 0) {
        console.log(`No mods to build`);
        return { exitCode, finished: true };
    }

    // Find where mod sdk is
    let toolsDir;
    try {
        toolsDir = await modTools.getModToolsDir();
    }
    catch (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    // Batch build mods
    for (let { modName, error } of await modTools.validateModNames(modNames, false)) {

        if (error) {
            print.error(`\n${error}`);
            exitCode = 1;
            continue;
        }

        try {
            await builder.buildMod(toolsDir, modName, {
                shouldRemoveTemp,
                makeWorkshopCopy,
                verbose,
                ignoreBuildErrors,
                modId
            });
        }
        catch (error) {
            print.error(error);
            exitCode = 1;
        }
    }

    return { exitCode, finished: true };
};
