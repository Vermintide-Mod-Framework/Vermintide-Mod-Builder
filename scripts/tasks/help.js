const version = require('../version');

module.exports = function taskHelp() {
    console.log(
        `Vermintide Mod Builder v${version}\n\n` +

        'vmb <command> [command-specific params] [-f <mods_folder>] [-g {1|2}] [--cfg <path_to_item_cfg>]\n' +
        '                                        [--rc <config_folder>] [--reset] [--use-fallback] [--cwd]\n\n' +

        'vmb config    [--<key1>=<value1> --<key2>=<value2>...]\n\n' +

        'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v {private|public|friends}]\n' +
        '                         [-c <content_folder>] [--tags "<tag1>; <tag2>;..."] [--template <template_folder>]\n\n' +

        'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v {private|public|friends}]\n' +
        '                         [-c <content_folder>] [--tags "<tag1>; <tag2>;..."]\n' +
        '                         [--ignore-errors] [--verbose] [--clean] [--source]\n\n' +

        'vmb upload    {<mod_name1> <mod_name2>... | --all}  [-n <changenote>] [--open] [--skip]\n\n' +

        'vmb open      {<mod_name> | --id <item_id>}\n\n' +

        'vmb build     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>]\n' +
        '                                           [--no-workshop] [--source]\n\n' +

        'vmb watch     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>]\n' +
        '                                           [--no-workshop] [--source]\n\n' +

        'vmb info      [<mod_name1> <mod_name2>...] [--show-cfg]\n\n' +
        'See README.md for more information.'
    );
    return { exitCode: 0, finished: false };
};
