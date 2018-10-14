const child_process = require('child_process');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');

const config = require('../modules/config');
const cfg = require('../modules/cfg');

// Uploads mod to the workshop
async function uploadMod(toolsDir, modName, changenote, skip) {

    let cfgPath = cfg.getPath(modName);

    // Path to .cfg
    let uploaderParams = [
        '-c', '"' + cfgPath + '"'
    ];

    if (config.get('gameNumber') === 2) {
        uploaderParams.push('-x');
    }

    // Changenote
    if (changenote) {
        uploaderParams.push('-n');
        uploaderParams.push('"' + changenote + '"');
    }

    // Whether to only update info from .cfg file
    if (skip) {
        uploaderParams.push('-s');
    }

    console.log(`Running uploader with steam app id ${config.get('gameId')}`);

    return await _runUploader(toolsDir, uploaderParams);
}

async function _runUploader(toolsDir, uploaderParams) {

    // Set uploader game id
    await pfs.writeFile(path.combine(toolsDir, config.get('uploaderDir'), config.get('uploaderGameConfig')), config.get('gameId'));

    // Spawn process
    let ugc_tool = child_process.spawn(
        config.get('uploaderExe'),
        uploaderParams,
        {
            // Working from uploader's folder
            cwd: path.combine(toolsDir, config.get('uploaderDir')),
            windowsVerbatimArguments: true
        }
    );

    let modId = '';
    ugc_tool.stdout.on('data', data => {
        data = String(data);

        // Print uploader's output
        console.log(str.rmn(data));

        // Check if uploader has printed item id
        if (data.includes('publisher_id')) {
            try {
                modId = data.match(/publisher_id: (\d*)/)[1];
            }
            catch (err) { }
        }
        else if (data.includes('Vermintide 2 End User License Agreement')) {

            ugc_tool.stdin.write('y');
        }
    });

    return await new Promise((resolve, reject) => {
        ugc_tool.on('error', error => reject(error));

        ugc_tool.on('close', code => {
            if (code) {

                // Print uploader error
                reject(new Error(
                    'Uploader exited with error code: ' + code +
                    (code == 3221225477 ? `\nCheck if Steam is running` : '')
                ));
            }
            else {

                // Return modId
                resolve(modId);
            }
        });
    });
}

// Returns steam workshop url for mod
function formUrl(modId) {
    return 'steam://url/CommunityFilePage/' + modId;
}

exports.uploadMod = uploadMod;
exports.formUrl = formUrl;
