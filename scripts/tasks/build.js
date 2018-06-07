const cl = require('../cl');

const modTools = require('../mod_tools');
const builder = require('../builder');

module.exports = async function buildTask() {

    let exitCode = 0;

    let { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams();

    if (modNames.length > 0) {
        console.log(`Mods to build:`);
        for (let modName of modNames) {
            console.log(`  ${modName}`);
        }
    }
    else {
        console.log(`No mods to build`);
        return { exitCode, finished: true };
    }

    let toolsDir = await modTools.getModToolsDir().catch((error) => {
        console.error(error);
        exitCode = 1;
    });

    if (toolsDir) {
        await builder.forEachMod(
            modNames,
            makeWorkshopCopy,
            async modName => {
                try {
                    await builder.buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId);
                }
                catch (error) {
                    console.error(error);
                    exitCode = 1;
                }
            },
            (error) => {
                console.error(`\n${error}`);
                exitCode = 1;
            }
        );
    }

    return { exitCode, finished: true };
};
