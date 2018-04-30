const pfs = require('./lib/pfs');
const path = require('./lib/path');
const gulp = require('gulp');
const opn = require('opn');
const cl = require('./cl');
const config = require('./config');

const modTools = require('./mod_tools');
const builder = require('./builder');
const uploader = require('./uploader');

let tasks = {
    // All of these have the optional -f param that sets mods directory and -g for setting game number

    // Prints all existing commands with params
    // vmb
    default(callback, args, plainArgs) {
        console.log(
            'vmb <command> [-f <folder>] [-g <game_number>] [--reset]\n' +
            'vmb params    [--<key1>=<value1> --<key2>=<value2>...]\n' +
            'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]\n' +
            'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--ignore-errors] [--verbose] [--temp]\n' +
            'vmb upload    <mod_name> [-n <changenote>] [--open] [--skip]\n' +
            'vmb open      {<mod_name> | --id <item_id>}\n' +
            'vmb build     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]\n' +
            'vmb watch     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]'
        );
        return callback();
    },

    // Sets and/or displayes params file values
    // Limited to non-object values
    // vmb params [--<key1>=<value1> --<key2>=<value2>...]
    async config(callback, args, plainArgs) {

        config.setData(args);

        try {
            await config.writeData();
        }
        catch (err) {
            console.error(err);
            console.error(`Couldn't save params`);
            return callback();
        }

        console.log(config.data);

        return callback();
    },

    // Creates a copy of the template mod and renames it to the provided name
    // Uploads an empty mod file to the workshop to create an id
    // vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
    async create(callback, args, plainArgs) {

        let exitCode = 0;

        let params = cl.getWorkshopParams(args, plainArgs);
        let modName = params.name;
        let modDir = path.combine(config.modsDir, modName);

        let error = '';
        if (!modTools.validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (await pfs.accessible(modDir + '/')) {
            error = `Folder "${modDir}" already exists`;
        }

        if (error) {
            console.error(error);
            exitCode = 1;
            return callback(exitCode);
        }

        console.log(`Copying template from "${config.templateDir}"`);

        try {
            await uploader.copyTemplate(params);
            await uploader.createCfgFile(params);

            let modId = await uploader.uploadMod(await modTools.getModToolsDir(), modName);

            let modUrl = uploader.formUrl(modId);
            console.log('Now you need to subscribe to ' + modUrl + ' in order to be able to build and test your mod.');
            console.log('Opening url...');
            await opn(modUrl);
        }
        catch (error) {
            console.error(error);
            exitCode = 1;

            // Cleanup directory if it has been created
            let modDir = path.combine(config.modsDir, modName);
            if (await pfs.accessible(modDir)) {
                try {
                    await pfs.deleteDirectory(modDir);
                }
                catch (error) {
                    console.error(error);
                }
            }
        }

        return callback(exitCode);
    },

    // Builds the mod then uploads it to workshop as a new item
    // vmb publish <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
    async publish(callback, args, plainArgs) {

        let exitCode = 0;

        let params = cl.getWorkshopParams(args, plainArgs);
        let modName = params.name;
        let modDir = path.combine(config.modsDir, modName);
        let buildParams = await cl.getBuildParams(args);

        let error = '';
        if (!modTools.validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (!await pfs.accessible(modDir + '/')) {
            error = `Folder "${modDir}" doesn't exist`;
        }
        else {
            try {
                await uploader.validateTemplate(config.templateDir);
            }
            catch (err) {
                error = err;
            }
        }

        if (error) {
            console.error(error);
            exitCode = 1;
            return callback(exitCode);
        }

        try {
            if (await uploader.cfgExists(modName)) {
                console.log(`Using existing ${config.cfgFile}`);
            }
            else {
                await uploader.createCfgFile(params);
            }

            let toolsDir = await modTools.getModToolsDir();
            await builder.buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, true, params.verbose, buildParams.ignoreBuildErrors, null);
            await pfs.copyIfDoesntExist(path.combine(config.templateDir, config.itemPreview), path.combine(modDir, config.itemPreview));
            await uploader.uploadMod(toolsDir, modName);

            let modId = await modTools.getModId(modName);
            let modUrl = uploader.formUrl(modId);
            console.log('Uploaded to ' + modUrl);
            console.log('Opening url...');
            await opn(modUrl);
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }
        return callback(exitCode);
    },

    // Uploads the last built version of the mod to the workshop
    // vmb upload <mod_name> [-n <changenote>] [--open] [--skip]
    async upload(callback, args, plainArgs) {

        let exitCode = 0;

        let modName = args.m || args.mod || plainArgs[0] || '';
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
            exitCode = 1;
            return callback(exitCode);
        }

        let changenote = args.n || args.note || args.changenote || '';
        if (typeof changenote != 'string') {
            changenote = '';
        }

        let openUrl = args.o || args.open || false;

        let skip = args.s || args.skip;

        try {
            await uploader.uploadMod(await modTools.getModToolsDir(), modName, changenote, skip);

            let modId = await modTools.getModId(modName);
            let modUrl = uploader.formUrl(modId);
            console.log('Uploaded to ' + modUrl);
            if (openUrl) {
                console.log('Opening url...');
                await opn(modUrl);
            }
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }

        return callback(exitCode);
    },

    // Opens mod's workshop page
    // vmb open <mod_name> [--id <item_id>]
    async open(callback, args, plainArgs) {

        let exitCode = 0;

        let modName = args.m || args.mod || plainArgs[0] || '';
        let modDir = path.combine(config.modsDir, modName);
        let modId = args.id || null;

        if (!modId) {
            let error = '';
            if (!modTools.validModName(modName)) {
                error = `Folder name "${modDir}" is invalid`;
            }
            else if (!await pfs.accessible(modDir + '/')) {
                error = `Folder "${modDir}" doesn't exist`;
            }

            if (error) {
                console.error(error);
                exitCode = 1;
                return callback(exitCode);
            }
        }

        try {

            if (!modId) {
                modId = await modTools.getModId(modName);
            }

            let url = uploader.formUrl(modId);
            console.log('Opening', url);
            await opn(url);
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }

        return callback(exitCode);
    },

    // Builds specified mods and copies the bundles to the game workshop folder
    // vmb build [<mod1> <mod2>...] [--verbose] [-t] [--id <item_id>] [--dist]
    // --verbose - prints stingray console output even on successful build
    // -t - doesn't delete temp folder before building
    // --id - forces item id. can only be passed if building one mod
    // --dist - doesn't copy to workshop folder
    async build(callback, args, plainArgs) {

        let exitCode = 0;

        let { modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams(args, plainArgs);

        if (modNames.length > 0) {
            console.log('Mods to build:');
            for (let modName of modNames) {
                console.log('  ' + modName);
            }
        }
        else {
            console.log('No mods to build');
            return callback(exitCode);
        }

        let toolsDir = await modTools.getModToolsDir().catch((error) => {
            exitCode = 1;
            console.error(error);
        });

        if (toolsDir) {
            await builder.forEachMod(
                modNames,
                noWorkshopCopy,
                async modName => {
                    try {
                        await builder.buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId);
                    }
                    catch (error) {
                        console.error(error);
                        exitCode = 1;
                    }
                },
                () => {
                    console.log();
                }
            );
        }

        return callback(exitCode);
    },

    // Watches for changes in specified mods and builds them whenever they occur
    // vmb watch [<mod1> <mod2>...] [--verbose] [-t] [--id <item_id>] [--dist]
    async watch(callback, args, plainArgs) {

        let exitCode = 0;

        let { modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams(args, plainArgs);

        if (modNames.length === 0) {
            console.log('No mods to watch');
            return callback(exitCode);
        }

        let toolsDir = await modTools.getModToolsDir().catch((error) => {
            console.error(error);
            exitCode = 1;
        });

        if (toolsDir) {
            console.log();

            await builder.forEachMod(
                modNames,
                noWorkshopCopy,
                (modName, modDir) => {
                    console.log(`Watching ${modName}...`);

                    let src = [
                        modDir,
                        '!' + config.modsDir + '/' + modName + '/*.tmp',
                        '!' + config.modsDir + '/' + modName + '/' + config.distDir + '/*'
                    ];

                    gulp.watch(src, async () => {
                        try {
                            await builder.buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId);
                        }
                        catch (error) {
                            console.error(error);
                        };
                    });
                }
            );
        }

        return callback(exitCode, false);
    }

};

module.exports = tasks;