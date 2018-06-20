const opn = require('opn');

const print = require('../print');

const cl = require('../modules/cl');

const modTools = require('../tools/mod_tools');
const uploader = require('../tools/uploader');

module.exports = async function taskUpload() {

    let exitCode = 0;

    if (cl.getPlainArgs().length === 0 && !cl.get('all')) {
        print.error('To upload all mods, use --all flag.');
        return { exitCode: 1, finished: true };
    }

    let modNames = await modTools.getModNames();

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
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    for (let { modName, error } of await modTools.validateModNames(modNames, true)) {

        if(error) {
            print.error(`\n${error}`);
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
            print.error(error);
            exitCode = 1;
        }
    };

    return { exitCode, finished: true };
};
