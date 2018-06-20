const child_process = require('child_process');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');

const config = require('../modules/config');
const cfg = require('../modules/cfg');

// Uploads mod to the workshop
async function uploadMod(toolsDir, modName, changenote, skip) {

    let cfgPath = cfg.getPath(modName);

    let uploaderParams = [
        '-c', '"' + cfgPath + '"'
    ];

    if (changenote) {
        uploaderParams.push('-n');
        uploaderParams.push('"' + changenote + '"');
    }

    if (skip) {
        uploaderParams.push('-s');
    }

    console.log(`Running uploader with steam app id ${config.get('gameId')}`);

    await pfs.writeFile(path.combine(toolsDir, config.get('uploaderDir'), config.get('uploaderGameConfig')), config.get('gameId'));
    let ugc_tool = child_process.spawn(
        config.get('uploaderExe'),
        uploaderParams,
        {
            cwd: path.combine(toolsDir, config.get('uploaderDir')),
            windowsVerbatimArguments: true
        }
    );

    let modId = '';
    ugc_tool.stdout.on('data', data => {
        data = String(data);

        console.log(str.rmn(data));
        if (data.includes('publisher_id')) {
            try {
                modId = data.match(/publisher_id: (\d*)/)[1];
            }
            catch (err) { }
        }
    });

    return await new Promise((resolve, reject) => {
        ugc_tool.on('error', error => reject(error));

        ugc_tool.on('close', code => {
            if(code) {
                reject(new Error(
                    'Uploader exited with error code: ' + code +
                    (code == 3221225477 ? `\nCheck if Steam is running` : '')
                ));
            }
            else {
                resolve(modId);
            }
        });
    });
}

// Returns steam workshop url for mod
function formUrl(modId) {
    return 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
}

exports.uploadMod = uploadMod;
exports.formUrl = formUrl;
