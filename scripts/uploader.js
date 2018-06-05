const child_process = require('child_process');
const gulp = require('gulp');
const replace = require('gulp-replace');
const rename = require('gulp-rename');
const fs = require('fs');
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const str = require('./lib/str');
const modTools = require('./mod_tools');

let uploader = {

    async validateTemplate(templateDir) {
        if (!await pfs.accessible(templateDir)) {
            throw `Template folder "${templateDir}" doesn't exist.`;
        }

        if (!await pfs.accessible(path.combine(templateDir, config.itemPreview))) {
            throw `Template folder "${templateDir}" doesn't have "${config.itemPreview}" in it.`;
        }
    },

    // Copies and renames mod template from %%template folder
    async copyTemplate(params) {

        let modName = params.name;
        let modDir = path.combine(config.modsDir, modName);

        await uploader.validateTemplate(config.templateDir);

        return await new Promise((resolve, reject) => {

            let regexName = new RegExp(config.templateName, 'g');
            let regexTitle = new RegExp(config.templateTitle, 'g');
            let regexDescription = new RegExp(config.templateDescription, 'g');
            gulp.src(config.modSrc, { base: config.templateDir })
                .pipe(replace(regexName, modName))
                .pipe(replace(regexTitle, params.title))
                .pipe(replace(regexDescription, params.description))
                .pipe(rename(p => {
                    p.dirname = p.dirname.replace(regexName, modName);
                    p.basename = p.basename.replace(regexName, modName);
                }))
                .pipe(gulp.dest(modDir))
                .on('error', err => {
                    throw err;
                })
                .on('end', () => {
                    if(config.coreSrc.length > 0){
                        gulp.src(config.coreSrc, { base: config.templateDir})
                            .pipe(gulp.dest(modDir))
                            .on('error', err => {
                                throw err;
                            })
                            .on('end', resolve);
                    }
                    else{
                        resolve();
                    }
                });
        });
    },

    async copyPlaceholderBundle(modName) {

        let modDir = path.combine(config.modsDir, modName);
        let modBundleDir = path.combine(modDir, config.bundleDir);

        if (!await pfs.accessible(modBundleDir)) {
            await pfs.mkdir(modBundleDir);
        }

        let placeholderBundle = path.join(`${__dirname}`, `/../embedded/placeholderV${config.gameNumber}`);

        return await new Promise((resolve, reject) => {
            fs.createReadStream(placeholderBundle)
                .on('error', reject)
                .pipe(fs.createWriteStream(path.combine(modBundleDir, modTools.hashModName(modName) + config.bundleExtension)))
                .on('error', reject)
                .on('close', () => {
                    resolve();
                });
        });
    },

    // Creates item.cfg file
    async createCfgFile(params) {
        let configText = `title = "${params.title}";\n` +
                        `description = "${params.description}";\n` +
                        `preview = "${config.itemPreview}";\n` +
                        `content = "${config.bundleDir}";\n` +
                        `language = "${params.language}";\n` +
                        `visibility = "${params.visibility}";\n`;
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

        console.log(`\nRunning uploader with steam app id ${config.gameId}`);
        console.log(config.buggedUploaderMessage);

        await pfs.writeFile(path.combine(toolsDir, config.uploaderDir, config.uploaderGameConfig), config.gameId);
        let uploader = child_process.spawn(
            config.uploaderExe,
            uploaderParams,
            {
                cwd: path.combine(toolsDir, config.uploaderDir),
                windowsVerbatimArguments: true
            }
        );

        let modId = '';
        uploader.stdout.on('data', data => {
            data = String(data);
            let checkStr = config.buggedUploaderMessage.split('\n')[0];
            if (data.substr(0, checkStr.length) === checkStr) {
                return;
            }

            console.log(str.rmn(data));
            if (data.includes('publisher_id')) {
                try {
                    modId = data.match(/publisher_id: (\d*)/)[1];
                }
                catch (err) { }
            }
        });

        return await new Promise((resolve, reject) => {
            uploader.on('error', error => reject(error));

            uploader.on('close', code => {
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
