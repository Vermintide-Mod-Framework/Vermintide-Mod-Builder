const opn = require('opn');
const cl = require('../cl');

const modTools = require('../mod_tools');
const uploader = require('../uploader');

module.exports = async function uploadTask() {

    let exitCode = 0;

    let modNames = await cl.getModNames();

    if (modNames.length > 1) {
        if(cl.argv.all) {
            console.log(`Mods to upload:`);
            for (let modName of modNames) {
                console.log(`  ${modName}`);
            }
        }
        else {
            console.error('To upload all mods, use --all flag.');
            return { exitCode, finished: true };
        }
    }
    else if(modNames.length === 0) {
        console.log('No mods to upload');
    }

    let changenote = cl.argv.n || cl.argv.note || cl.argv.changenote || '';
    if (typeof changenote != 'string') {
        changenote = '';
    }

    let openUrl = cl.argv.o || cl.argv.open;

    let skip = cl.argv.s || cl.argv.skip;

    let modToolsDir;
    try {
        modToolsDir = await modTools.getModToolsDir();
    }
    catch (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    }

    await modTools.forEachMod(
        modNames,
        true,
        async modName => {
            try {
                console.log(`\nUploading ${modName}`);

                await uploader.uploadMod(modToolsDir, modName, changenote, skip);

                let modId = await modTools.getModId(modName);
                let modUrl = uploader.formUrl(modId);
                console.log(`Uploaded to ${modUrl}`);

                if (openUrl) {
                    console.log(`Opening url...`);
                    await opn(modUrl);
                }

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

    return { exitCode, finished: true };
};
