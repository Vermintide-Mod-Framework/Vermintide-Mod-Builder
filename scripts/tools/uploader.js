const child_process = require('child_process');
const os = require('os');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');

const modTools = require('../tools/mod_tools');

const config = require('../modules/config');
const cfg = require('../modules/cfg');

// Uploads mod to the workshop
async function uploadMod(toolsDir, modName, changenote, skip) {
    // Path to .cfg
    let uploaderParams = [
        '-c'
    ];
    if (process.platform == 'linux') {
        // The cfg path passed to ugc_tool has to be inside
        // Proton prefix, otherwise, link inside the config
        // will be broken.
        // The mod directory will be symlinked to this location
        // right before uploading to workshop.
        let cfgBase = cfg.getBase();
        uploaderParams.push('C:\\modDirSymlink\\' + cfgBase);
    } else {
        let cfgPath = cfg.getPath(modName);
        uploaderParams.push('"' + cfgPath + '"');
    }

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

    return await _runUploader(toolsDir, uploaderParams, modName);
}

async function _runUploader(toolsDir, uploaderParams, modName) {

    // Set uploader game id
    await pfs.writeFile(path.combine(toolsDir, config.get('uploaderDir'), config.get('uploaderGameConfig')), config.get('gameId'));

    let uploaderExe = config.get('uploaderExe');

    if (process.platform == 'linux') {
        let protonDir;
        try {
            protonDir = await modTools.getProtonDir();
        }
        catch (error) {
            print.error(error);
            return { exitCode: 1, finished: true };
        }

        let protonExe = path.combine(protonDir, config.get('protonExe'));
        uploaderParams.unshift(uploaderExe);
        uploaderParams.unshift('run');
        uploaderExe = protonExe;

        let protonPrefixDir = await modTools.getCompatDataDir(config.get('toolsId'));

        process.env['STEAM_COMPAT_DATA_PATH'] = protonPrefixDir;

        let modDirPath = cfg.getDir(modName);
        let modDirSymlinkPath = path.combine(protonPrefixDir, 'pfx/drive_c/modDirSymlink');
        if (pfs.accessible(modDirSymlinkPath)) {
            pfs.unlink(modDirSymlinkPath);
        }
        await pfs.symlink(modDirPath, modDirSymlinkPath);
    }
    // Spawn process
    let ugc_tool = child_process.spawn(
        uploaderExe,
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

    ugc_tool.stderr.on('data', data => {
        console.error(str.rmn(data));
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
function formSteamUrl(modId) {
    return 'steam://url/CommunityFilePage/' + modId;
}

function formUrl(modId) {
    return 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
}

exports.uploadMod = uploadMod;
exports.formSteamUrl = formSteamUrl;
exports.formUrl = formUrl;
