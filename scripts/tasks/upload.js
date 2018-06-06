const pfs = require('../lib/pfs');
const path = require('../lib/path');
const opn = require('opn');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const uploader = require('../uploader');

module.exports = async function uploadTask() {

    let exitCode = 0;

    let modName = cl.getFirstModName();
    let modDir = path.combine(config.modsDir, modName);

    let error = '';
    if (!modTools.validModName(modName)) {
        error = `Folder name "${modDir}" is invalid`;
    }
    else if (!await pfs.accessible(modDir + '/')) {
        error = `Folder "${modDir}" doesn't exist`;
    }

    if (error) {
        console.error(error);
        return { exitCode: 1, finished: true };
    }

    let changenote = cl.argv.n || cl.argv.note || cl.argv.changenote || '';
    if (typeof changenote != 'string') {
        changenote = '';
    }

    let openUrl = cl.argv.o || cl.argv.open || false;

    let skip = cl.argv.s || cl.argv.skip;

    try {
        await uploader.uploadMod(await modTools.getModToolsDir(), modName, changenote, skip);

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

    return { exitCode, finished: true };
};
