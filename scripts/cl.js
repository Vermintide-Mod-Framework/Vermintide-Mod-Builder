
const pfs = require('./lib/pfs');
const config = require('./config');

// Commandline arguments
const minimist = require('minimist');
let argv = {};

let cl = {
    argv: {},
    plainArgs: [],

    init(argv) {
        cl.argv = argv = minimist(argv);
    },

    // Returns <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
    getWorkshopParams() {

        let modName = argv.m || argv.mod || cl.plainArgs[0] || '';
        let modTitle = argv.t || argv.title || modName;

        return {
            name: modName,
            title: modTitle,
            description: argv.d || argv.desc || argv.description || modTitle + ' description',
            language: argv.l || argv.language || 'english',
            visibility: argv.v || argv.visibility || 'private',
            verbose: argv.verbose
        };
    },

    // Returns ["<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
    async getBuildParams() {

        let verbose = argv.verbose || false;
        let shouldRemoveTemp = argv.temp || false;
        let modNames = cl.plainArgs.slice();

        if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
            try {
                modNames = await pfs.getDirs(config.modsDir, config.ignoredDirs);
            }
            catch(err) {
                console.error(err);
            }
        }

        let modId = modNames.length == 1 ? argv.id : null;
        let noWorkshopCopy = argv.dist || false;
        let ignoreBuildErrors = argv.e || argv['ignore-errors'] || argv['ignore-build-errors'] || config.data.ignore_build_errors;

        return { modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors };
    }
};

module.exports = cl;
