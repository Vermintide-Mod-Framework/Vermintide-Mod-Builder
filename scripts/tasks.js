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
    default() {
        console.log(
            'vmb <command> [-f <mods_folder>] [-g <game_number>] [--rc <config_folder>] [--reset] [--use-fallback] [--cwd]\n' +
            'vmb config    [--<key1>=<value1> --<key2>=<value2>...]\n' +
            'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]\n' +
            'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--ignore-errors] [--verbose] [--clean]\n' +
            'vmb upload    <mod_name> [-n <changenote>] [--open] [--skip]\n' +
            'vmb open      {<mod_name> | --id <item_id>}\n' +
            'vmb build     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>] [--no-workshop]\n' +
            'vmb watch     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>] [--no-workshop]\n' +
            'See README.md for more information.'
        );
        return { exitCode: 0, finished: false };
    },

    // Sets and/or displayes config file values
    // Limited to non-object values
    async config() {

        config.setData(cl.argv);

        try {
            await config.writeData();
        }
        catch (err) {
            console.error(err);
            console.error(`Couldn't save config`);
            return { exitCode: 1, finished: false };
        }

        console.log(config.data);

        return { exitCode: 0, finished: false };
    },

    // Creates a copy of the template mod and renames it to the provided name
    // Uploads an empty mod file to the workshop to create an id
    async create() {

        let exitCode = 0;

        let params = cl.getWorkshopParams();
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
            return { exitCode: 1, finished: true };
        }

        console.log(`Copying template from "${config.templateDir}"`);

        try {
            await uploader.copyTemplate(params);
            await uploader.createCfgFile(params);

            let modId = await uploader.uploadMod(await modTools.getModToolsDir(), modName);

            let modUrl = uploader.formUrl(modId);
            console.log(`Now you need to subscribe to ${modUrl} in order to be able to build and test your mod.`);
            console.log(`Opening url...`);
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

        return { exitCode, finished: true };
    },

    // Builds the mod then uploads it to workshop as a new item
    async publish() {

        let exitCode = 0;

        let params = cl.getWorkshopParams();
        let modName = params.name;
        let modDir = path.combine(config.modsDir, modName);
        let buildParams = await cl.getBuildParams();

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
            return { exitCode: 1, finished: true };
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
            console.log(`Uploaded to ${modUrl}`);
            console.log(`Opening url...`);
            await opn(modUrl);
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }

        return { exitCode, finished: true };
    },

    // Uploads the last built version of the mod to the workshop
    async upload() {

        let exitCode = 0;

        let modName = cl.argv.m || cl.argv.mod || cl.plainArgs[0] || '';
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
            return { exitCode: 1, finished: true };
        }

        let changenote = cl.argv.n || cl.argv.note || cl.argv.changenote || '';
        if (typeof changenote != 'string') {
            changenote = '';
        }

        let openUrl = cl.argv.o || cl.argv.open || false;

        let skip = cl.argv.s || cl.argv.skip;

        try {
            await uploader.uploadMod(await modTools.getModToolsDir(), modName, changenote, skip);

            let modId = await modTools.getModId(modName);
            let modUrl = uploader.formUrl(modId);
            console.log(`Uploaded to ${modUrl}`);
            if (openUrl) {
                console.log(`Opening url...`);
                await opn(modUrl);
            }
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }

        return { exitCode, finished: true };
    },

    // Opens mod's workshop page
    async open() {

        let exitCode = 0;

        let modName = cl.argv.m || cl.argv.mod || cl.plainArgs[0] || '';
        let modDir = path.combine(config.modsDir, modName);
        let modId = cl.argv.id || null;

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
                return { exitCode: 1, finished: true };
            }
        }

        try {

            if (!modId) {
                modId = await modTools.getModId(modName);
            }

            let url = uploader.formUrl(modId);
            console.log(`Opening ${url}`);
            await opn(url);
        }
        catch (error) {
            console.error(error);
            exitCode = 1;
        }

        return { exitCode, finished: true };
    },

    // Builds specified mods and copies the bundles to the game workshop folder
    async build() {

        let exitCode = 0;

        let { modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams();

        if (modNames.length > 0) {
            console.log(`Mods to build:`);
            for (let modName of modNames) {
                console.log(`  ${modName}`);
            }
        }
        else {
            console.log(`No mods to build`);
            return { exitCode, finished: true };
        }

        let toolsDir = await modTools.getModToolsDir().catch((error) => {
            console.error(error);
            exitCode = 1;
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
                    exitCode = 1;
                }
            );
        }

        return { exitCode, finished: true };
    },

    // Watches for changes in specified mods and builds them whenever they occur
    async watch() {

        let exitCode = 0;

        let { modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors } = await cl.getBuildParams();

        if (modNames.length === 0) {
            console.log(`No mods to watch`);
            return { exitCode, finished: true };
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
                            exitCode = 1;
                        };
                    });
                },
                () => {
                    exitCode = 1;
                }
            );
        }

        return {exitCode, finished: false};
    }

};

module.exports = tasks;