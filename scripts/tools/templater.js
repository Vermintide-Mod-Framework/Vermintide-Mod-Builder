const vinyl = require('vinyl-fs');
const replace = require('gulp-replace');
const rename = require('gulp-rename');

const pfs = require('../lib/pfs');
const path = require('../lib/path');

const config = require('../modules/config');

const modTools = require('./mod_tools');

const fs = require('fs');

// Throws if template folder doesn't exist or doesn't have itemPreview file in it
async function validateTemplate(templateDir) {

    if (!await pfs.accessibleDir(templateDir)) {
        throw new Error(`Template folder "${templateDir}" doesn't exist.`);
    }

    if (!await pfs.accessibleFile(path.combine(templateDir, config.get('itemPreview')))) {
        throw new Error(`Template folder "${templateDir}" doesn't have "${config.get('itemPreview')}" in it.`);
    }
}

//pair of functions to copy a file or folder if the source exists
function copyFileSync( source, target ) {
    if (fs.existsSync( source )) {
        var targetFile = target;

        if ( fs.existsSync( target ) ) {
            if ( fs.lstatSync( target ).isDirectory() ) {
                targetFile = path.join( target, path.basename( source ) );
            }
        }

        fs.writeFileSync(targetFile, fs.readFileSync(source));
    }
}

function copyFolderRecursiveSync( source, target) {
    if (fs.existsSync( source )) {
        var files = [];

        var targetFolder = path.join( target, path.basename( source ) );
        if ( !fs.existsSync( targetFolder ) ) {
            fs.mkdirSync( targetFolder );
        }

        if ( fs.lstatSync( source ).isDirectory() ) {
            files = fs.readdirSync( source );
            files.forEach( function ( file ) {
                var curSource = path.join( source, file );
                if ( fs.lstatSync( curSource ).isDirectory() ) {
                    copyFolderRecursiveSync( curSource, targetFolder );
                } else {
                    copyFileSync( curSource, targetFolder );
                }
            } );
        }
    }
}

// Copies and renames mod template folder and its contents
async function copyTemplate(params) {

    let modName = params.name;
    let modDir = modTools.getModDir(modName);
    let sdkDir = await modTools.getModToolsDir();

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

                    //these functions should probably be spun off into a more robust solution
                    //something that searches the VT2 sdk install folder for a list of required folders/files
                    copyFolderRecursiveSync(sdkDir+"/streamable_resources/core", modDir)
                    copyFileSync(sdkDir+"/streamable_resources/lua_preprocessor_defines.config", modDir)
                    
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
async function createPlaceholderModFile(modName, bundleBase) {

    let bundleDir = await _setUpBundleDir(modName, bundleBase);

    let modFileExtenstion = config.get('modFileExtension');
    let placeholderModFilePath = path.join(`${__dirname}`, `/../../embedded/placeholder${modFileExtenstion}`);
    let modFilePath = path.combine(bundleDir, modName + modFileExtenstion);

    await pfs.copyFile(placeholderModFilePath, modFilePath);
}

// Copies contents of placeholder bundle to modsDir/modName/bundleDir/
async function createPlaceholderBundle(modName, bundleBase) {

    let bundleDir = await _setUpBundleDir(modName, bundleBase);

    let placeholderBundle = path.join(`${__dirname}`, `/../../embedded/placeholderV${config.get('gameNumber')}`);
    let bundleFilePath = path.combine(bundleDir, modTools.hashModName(modName) + config.get('bundleExtension'));

    await pfs.copyFile(placeholderBundle, bundleFilePath);
}

// Creates bundle dir if it doesn't exist, return its path
async function _setUpBundleDir(modName, bundleBase) {
    let bundleDir;

    if (bundleBase) {
        bundleDir = path.absolutify(path.fix(bundleBase), modTools.getModDir(modName));
    }
    else {
        bundleDir = modTools.getDefaultBundleDir(modName);
    }

    if (!await pfs.accessibleDir(bundleDir)) {
        await pfs.mkdir(bundleDir);
    }

    return bundleDir;
}

exports.validateTemplate = validateTemplate;
exports.copyTemplate = copyTemplate;
exports.createPlaceholderModFile = createPlaceholderModFile;
exports.createPlaceholderBundle = createPlaceholderBundle;