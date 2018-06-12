const opn = require('opn');
const cl = require('../cl');

const modTools = require('../mod_tools');
const uploader = require('../uploader');

module.exports = async function uploadTask() {

    let exitCode = 0;

    if (cl.getPlainArgs().length === 0 && !cl.get('all')) {
        console.error('To upload all mods, use --all flag.');
        return { exitCode: 1, finished: true };
    }

    let modNames = await cl.getModNames();

    if (modNames.length > 1) {
        console.log(`Mods to upload:`);
        for (let modName of modNames) {
            console.log(`  ${modName}`);
        }
    }
    else if(modNames.length === 0) {
        console.log('No mods to upload');
    }

    let changenote = cl.get('n') || cl.get('note') || cl.get('changenote') || '';
    if (typeof changenote != 'string') {
        changenote = '';
    }

    let openUrl = cl.get('o') || cl.get('open');

    let skip = cl.get('s') || cl.get('skip');

    let modToolsDir;
    try {
        modToolsDir = await modTools.getModToolsDir();
    }
    catch (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    }

    for (let { modName, error } of await modTools.validateModNames(modNames, true)) {

        if(error) {
            console.error(`\n${error}`);
            exitCode = 1;
            continue;
        }

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
    };

    return { exitCode, finished: true };
};
