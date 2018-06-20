const vinyl = require('vinyl-fs');
const replace = require('gulp-replace');
const rename = require('gulp-rename');

const pfs = require('../lib/pfs');
const path = require('../lib/path');

const config = require('../modules/config');

const modTools = require('./mod_tools');

// Throws if template folder doesn't exist or doesn't have itemPreview file in it
async function validateTemplate(templateDir) {

    if (!await pfs.accessible(templateDir)) {
        throw new Error(`Template folder "${templateDir}" doesn't exist.`);
    }

    if (!await pfs.accessible(path.combine(templateDir, config.get('itemPreview')))) {
        throw new Error(`Template folder "${templateDir}" doesn't have "${config.get('itemPreview')}" in it.`);
    }
}

// Copies and renames mod template folder and its contents
async function copyTemplate(params) {

    let modName = params.name;
    let modDir = modTools.getModDir(modName);

    // Check that template is valid
    await validateTemplate(config.get('templateDir'));

    return await new Promise((resolve, reject) => {

        // RegEx's to replace %%name, %%title and %%description
        let regexName = new RegExp(config.get('templateName'), 'g');
        let regexTitle = new RegExp(config.get('templateTitle'), 'g');
        let regexDescription = new RegExp(config.get('templateDescription'), 'g');

        // Copy folder, renaming files and dirs and replacing contents
        // config already has a blob definition for which files should be copied and modified
        vinyl.src(config.get('modSrc'), { base: config.get('templateDir') })
            .pipe(replace(regexName, modName))
            .pipe(replace(regexTitle, params.title))
            .pipe(replace(regexDescription, params.description))
            .pipe(rename(p => {
                p.dirname = p.dirname.replace(regexName, modName);
                p.basename = p.basename.replace(regexName, modName);
            }))
            .pipe(vinyl.dest(modDir))
            .on('error', reject)
            .on('end', () => {

                // Copy files that shouldn't be modified
                if (config.get('coreSrc').length > 0) {
                    vinyl.src(config.get('coreSrc'), { base: config.get('templateDir') })
                        .pipe(vinyl.dest(modDir))
                        .on('error', reject)
                        .on('end', resolve);
                }
                else {
                    resolve();
                }
            });
    });
}

// Copies contents of placeholder.mod file to modsDir/modName/bundleDir/modName.mod
async function createPlaceholderModFile(modName) {

    let bundleDir = await _setUpBundleDir(modName);

    let modFileExtenstion = config.get('modFileExtension');
    let placeholderModFilePath = path.join(`${__dirname}`, `/../../embedded/placeholder${modFileExtenstion}`);
    let modFilePath = path.combine(bundleDir, modName + modFileExtenstion);

    await pfs.copyFile(placeholderModFilePath, modFilePath);
}

// Copies contents of placeholder bundle to modsDir/modName/bundleDir/
async function createPlaceholderBundle(modName) {

    let bundleDir = await _setUpBundleDir(modName);

    let placeholderBundle = path.join(`${__dirname}`, `/../../embedded/placeholderV${config.get('gameNumber')}`);
    let bundleFilePath = path.combine(bundleDir, modTools.hashModName(modName) + config.get('bundleExtension'));

    await pfs.copyFile(placeholderBundle, bundleFilePath);
}

// Creates bundle dir if it doesn't exist, return its path
async function _setUpBundleDir(modName) {
    let bundleDir = modTools.getDefaultBundleDir(modName);

    if (!await pfs.accessible(bundleDir)) {
        await pfs.mkdir(bundleDir);
    }

    return bundleDir;
}

exports.validateTemplate = validateTemplate;
exports.copyTemplate = copyTemplate;
exports.createPlaceholderModFile = createPlaceholderModFile;
exports.createPlaceholderBundle = createPlaceholderBundle;