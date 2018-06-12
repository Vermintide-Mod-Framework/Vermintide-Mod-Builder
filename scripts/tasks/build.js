const cl = require('../cl');

const modTools = require('../mod_tools');
const buildMod = require('../builder');

module.exports = async function buildTask() {

    let exitCode = 0;

    let { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams();

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

    let toolsDir;
    try {
        toolsDir = await modTools.getModToolsDir();
    }
    catch (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    }

    for (let { modName, error} of await modTools.validateModNames(modNames, makeWorkshopCopy)) {

        if (error) {
            console.error(`\n${error}`);
            exitCode = 1;
            continue;
        }

        try {
            await buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId);
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }
    }

    return { exitCode, finished: true };
};
