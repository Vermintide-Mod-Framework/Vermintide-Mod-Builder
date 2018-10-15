const opn = require('opn');

const print = require('../print');

const pfs = require('../lib/pfs');

const cl = require('../modules/cl');

const modTools = require('../tools/mod_tools');
const uploader = require('../tools/uploader');

module.exports = async function taskOpen() {

    let exitCode = 0;

    let modName = modTools.getFirstModName();
    let modDir = modTools.getModDir(modName);
    let modId = cl.get('id') || null;

    // Validate modName if id wasn't provided
    if (!modId) {
        let error = '';
        if (!modTools.validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (!await pfs.accessibleDir(modDir)) {
            error = `Folder "${modDir}" doesn't exist`;
        }

        if (error) {
            print.error(error);
            return { exitCode: 1, finished: true };
        }
    }

    try {

        // Get mod id if it wasn't provided
        if (!modId) {
            modId = await modTools.getModId(modName);
        }

        // Form and open mod url
        let url = uploader.formUrl(modId);
        let steamUrl = uploader.formSteamUrl(modId);
        console.log(`Opening ${url}`);
        await opn(steamUrl);
    }
    catch (error) {
        print.error(error);
        exitCode = 1;
    }

    return { exitCode, finished: true };
};
