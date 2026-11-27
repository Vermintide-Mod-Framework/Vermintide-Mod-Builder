const print = require('../print');

const pfs = require('../lib/pfs');

const cl = require('../modules/cl');

const modTools = require('../tools/mod_tools');
const contentSetup = require('../tools/content_setup');
const levelAdder = require('../tools/level_adder');

// Adds a level to a mod and sets the Modding Tools Content's level editor up to work on it
module.exports = async function taskAddLevel() {

    let [modName, levelName] = cl.getPlainArgs();
    let modDir = modTools.getModDir(modName || '');

    let error = '';
    if (!modName || !levelName) {
        error = 'Usage: vmb add-level <mod_name> <level_name>';
    }
    else if (!modTools.validModName(modName)) {
        error = `Folder name "${modDir}" is invalid`;
    }
    else if (!await pfs.accessibleDir(modDir)) {
        error = `Folder "${modDir}" doesn't exist`;
    }
    else if (!/^[a-z][a-z0-9_]*$/.test(levelName)) {
        error = `Level name "${levelName}" must be lower case letters, digits and _, starting with a letter`;
    }

    if (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    try {
        let contentDir = await modTools.getContentDir();

        for (let file of contentSetup.setup(contentDir)) {
            console.log(`Added ${file} to the Modding Tools Content`);
        }

        for (let line of levelAdder.addLevel(contentDir, modDir, modName, levelName)) {
            console.log(line);
        }

        console.log(
            `\nCompile the project in ToolCenter, then open levels/${modName}/${levelName}/world in the level editor.\n` +
            `To play it from ToolCenter, run with -auto-host-level ${levelName} -disable-tutorial-at-start.\n` +
            `Adding the level to the mod's own scripts and package is up to you.`
        );
    }
    catch (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    return { exitCode: 0, finished: true };
};
