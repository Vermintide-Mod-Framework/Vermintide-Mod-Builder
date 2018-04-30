
const pfs = require('./pfs');
const config = require('./config');

// Commandline arguments
const argv = require('minimist')(process.argv);

module.exports = {
    argv,

    // Returns <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
    getWorkshopParams(args, plainArgs) {

        let modName = args.m || args.mod || plainArgs[0] || '';
        let modTitle = args.t || args.title || modName;

        return {
            name: modName,
            title: modTitle,
            description: args.d || args.desc || args.description || modTitle + ' description',
            language: args.l || args.language || 'english',
            visibility: args.v || args.visibility || 'private',
            verbose: args.verbose
        };
    },

    // Returns ["<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
    async getBuildParams(args, plainArgs) {

        let verbose = args.verbose || false;
        let shouldRemoveTemp = args.temp || false;
        let modNames = plainArgs;

        if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
            modNames = await pfs.getModDirs(config.modsDir, config.ignoredDirs);
        }

        let modId = modNames.length == 1 ? args.id : null;
        let noWorkshopCopy = args.dist || false;
        let ignoreBuildErrors = args.e || args['ignore-errors'] || args['ignore-build-errors'] || config.data.ignore_build_errors;

        return { modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors };
    }
};
