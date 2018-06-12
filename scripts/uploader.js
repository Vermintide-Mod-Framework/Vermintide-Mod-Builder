const child_process = require('child_process');
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const str = require('./lib/str');

let uploader = {

    // Creates item.cfg file
    async createCfgFile(params) {

        let tagArray = String(params.tags).split(/;\s*/);
        let tags = '';
        tagArray.forEach(tag => {

            if(tag.length === 0) {
                return;
            }

            if(tags.length > 0) {
                tags += ', ';
            }

            tags += `"${tag}"`;
        });

        let configText = `title = "${params.title}";\n` +
                        `description = "${params.description}";\n` +
                        `preview = "${config.itemPreview}";\n` +
                        `content = "${config.bundleDir}";\n` +
                        `language = "${params.language}";\n` +
                        `visibility = "${params.visibility}";\n` +
                        `tags = [${tags}]`;
        console.log(`${config.cfgFile}:`);
        console.log(`  ${str.rmn(configText).replace(/\n/g, '\n  ')}`);
        return await pfs.writeFile(path.combine(config.modsDir, params.name, config.cfgFile), configText);
    },

    // Uploads mod to the workshop
    async uploadMod(toolsDir, modName, changenote, skip) {

        let configPath = config.modsDir + '\\' + modName + '\\' + config.cfgFile;

        let uploaderParams = [
            '-c', '"' + configPath + '"'
        ];

        if (changenote) {
            uploaderParams.push('-n');
            uploaderParams.push('"' + changenote + '"');
        }

        if (skip) {
            uploaderParams.push('-s');
        }

        console.log(`Running uploader with steam app id ${config.gameId}`);

        await pfs.writeFile(path.combine(toolsDir, config.uploaderDir, config.uploaderGameConfig), config.gameId);
        let ugc_tool = child_process.spawn(
            config.uploaderExe,
            uploaderParams,
            {
                cwd: path.combine(toolsDir, config.uploaderDir),
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
                    reject(
                        'Uploader exited with error code: ' + code +
                        (code == 3221225477 ? `\nCheck if Steam is running` : '')
                    );
                }
                else {
                    resolve(modId);
                }
            });
        });
    },

    // Returns steam workshop url for mod
    formUrl(modId) {
        return 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
    },

    // Checks if the mod has published_id in its item.cfg
    async cfgExists(modName) {

        let modCfg = path.combine(config.modsDir, modName, config.cfgFile);

        if(!await pfs.accessible(modCfg)){
            return false;
        }

        let data = await pfs.readFile(modCfg, 'utf8');

        if(data.match(/^published_id *=? *(\d*)\D*$/m)) {
            throw `Mod has already been published for Vermintide ${config.gameNumber}, use vmb upload instead.`;
        }

        return true;
    }

};

module.exports = uploader;
