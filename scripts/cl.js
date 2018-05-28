const pfs = require('./lib/pfs');
const config = require('./config');

// Commandline arguments
const minimist = require('./lib/minimist');
let argv = {};

let cl = {
    argv: {},
    plainArgs: [],

    init(args) {
        cl.argv = argv = minimist(args);
    },

    // Returns an object with all create/upload/publish params
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

    // Returns an object with all build params
    async getBuildParams() {

        let verbose = argv.verbose || false;
        let shouldRemoveTemp = argv.clean || false;
        let modNames = cl.plainArgs.slice();

        if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
            try {
                modNames = await pfs.getDirs(config.modsDir, config.ignoredDirs);
            }
            catch(err) {
                console.error(err);
            }
        }

        let modId = modNames && modNames.length == 1 ? argv.id : null;
        let makeWorkshopCopy = !argv['no-workshop'];
        let ignoreBuildErrors = argv.e || argv['ignore-errors'] || argv['ignore-build-errors'] || config.ignoreBuildErrors;

        return { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors };
    }
};

module.exports = cl;
