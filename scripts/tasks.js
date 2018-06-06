let tasks = {
    // Prints all existing commands with params
    help: require('./tasks/help'),

    // Sets and/or displayes config file values
    // Limited to non-object values
    config: require('./tasks/config'),

    // Creates a copy of the template mod and renames it to the provided name
    // Uploads an empty mod file to the workshop to create an id
    create: require('./tasks/create'),

    // Builds the mod then uploads it to workshop as a new item
    publish: require('./tasks/publish'),

    // Uploads the last built version of the mod to the workshop
    upload: require('./tasks/upload'),

    // Opens mod's workshop page
    open: require('./tasks/open'),

    // Builds specified mods and copies the bundles to the game workshop folder
    build: require('./tasks/build'),

    // Watches for changes in specified mods and builds them whenever they occur
    watch: require('./tasks/watch'),

    // Lists information about mods (folder, last built, published status, cfg file)
    info: require('./tasks/info')
};

module.exports = tasks;