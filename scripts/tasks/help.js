const opn = require('opn');

const cl = require('../modules/cl');

const version = require('../version');

let help = [ 'build', 'config', 'create', 'info', 'open', 'publish', 'upload', 'watch' ];

let wikiLink = 'https://github.com/Vermintide-Mod-Framework/Vermintide-Mod-Builder/wiki';

module.exports = async function taskHelp(taskName) {

    if (taskName == 'help') {
        let plainArgs = cl.getPlainArgs();
        let otherTaskName = plainArgs && plainArgs[0];

        if(otherTaskName) {
            taskName = otherTaskName;
        }
    }

    if(taskName) {

        if (taskName == 'help') {
            await opn(wikiLink);
        }
        else if(help.includes(taskName)) {
            await opn(`${wikiLink}/command-:-${taskName}`);
        }
        else {
            console.log(`Unknown command '${taskName}'`);
            console.log(`Try one of these: ${help.join(', ')}`);
        }
    }
    else {

        console.log(

            `Usage:\n` +
            `  vmb <command> [command-specific params] [-f <mods_folder>] [-g {1|2}] [--cfg <path_to_item_cfg>]\n` +
            `                                          [--rc <config_folder>] [--reset] [--use-fallback] [--cwd]\n\n` +

            `Commands:\n` +
            '  vmb config  [--<key1>=<value1> --<key2>=<value2>...]\n\n' +

            '  vmb create  <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v {private|public|friends}]\n' +
            '                         [-c <content_folder>] [--tags "<tag1>; <tag2>;..."] [--template <template_folder>]\n\n' +

            '  vmb publish <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v {private|public|friends}]\n' +
            '                         [-c <content_folder>] [--tags "<tag1>; <tag2>;..."]\n' +
            '                         [--ignore-errors] [--verbose] [--clean] [--source]\n\n' +

            '  vmb upload  {<mod_name1> <mod_name2>... | --all}  [-n <changenote>] [--open] [--skip]\n\n' +

            '  vmb open    {<mod_name> | --id <item_id>}\n\n' +

            '  vmb build   [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>]\n' +
            '                                           [--no-workshop] [--source]\n\n' +

            '  vmb watch   [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>]\n' +
            '                                           [--no-workshop] [--source]\n\n' +

            '  vmb info    [<mod_name1> <mod_name2>...] [--show-cfg]\n\n' +

            'For more information on specific commands:\n' +
            '  vmb help <command>\n' +
            '  vmb      <command> --help \n\n' +

            'For information about command-agnostic parameters:\n' +
            '  vmb help\n\n' +

            `Vermintide Mod Builder v${version}`
        );
    }

    return { exitCode: 0, finished: false };
};
