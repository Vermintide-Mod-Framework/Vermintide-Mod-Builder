const vinyl = require('vinyl-fs');
const replace = require('gulp-replace');
const rename = require('gulp-rename');
const fs = require('fs');
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const modTools = require('./mod_tools');

let templater = {

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

        await templater.validateTemplate(config.templateDir);

        return await new Promise((resolve, reject) => {

            let regexName = new RegExp(config.templateName, 'g');
            let regexTitle = new RegExp(config.templateTitle, 'g');
            let regexDescription = new RegExp(config.templateDescription, 'g');
            vinyl.src(config.modSrc, { base: config.templateDir })
                .pipe(replace(regexName, modName))
                .pipe(replace(regexTitle, params.title))
                .pipe(replace(regexDescription, params.description))
                .pipe(rename(p => {
                    p.dirname = p.dirname.replace(regexName, modName);
                    p.basename = p.basename.replace(regexName, modName);
                }))
                .pipe(vinyl.dest(modDir))
                .on('error', err => {
                    throw err;
                })
                .on('end', () => {
                    if (config.coreSrc.length > 0) {
                        vinyl.src(config.coreSrc, { base: config.templateDir })
                            .pipe(vinyl.dest(modDir))
                            .on('error', err => {
                                throw err;
                            })
                            .on('end', resolve);
                    }
                    else {
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
    }
};

module.exports = templater;
