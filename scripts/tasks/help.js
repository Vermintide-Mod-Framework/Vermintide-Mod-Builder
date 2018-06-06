const version = require('../version');

module.exports = function helpTask() {
    console.log(
        `Vermintide Mod Builder v${version}\n` +
        'vmb <command> [-f <mods_folder>] [-g <game_number>] [--rc <config_folder>] [--reset] [--use-fallback] [--cwd]\n' +
        'vmb config    [--<key1>=<value1> --<key2>=<value2>...]\n' +
        'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]\n' +
        'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--ignore-errors] [--verbose] [--clean]\n' +
        'vmb upload    <mod_name> [-n <changenote>] [--open] [--skip]\n' +
        'vmb open      {<mod_name> | --id <item_id>}\n' +
        'vmb build     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>] [--no-workshop]\n' +
        'vmb watch     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>] [--no-workshop]\n' +
        'vmb info      [<mod_name1> <mod_name2>...] [--cfg]\n' +
        'See README.md for more information.'
    );
    return { exitCode: 0, finished: false };
};
