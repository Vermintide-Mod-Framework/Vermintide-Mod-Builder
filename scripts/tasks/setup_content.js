const print = require('../print');

const modTools = require('../tools/mod_tools');
const contentSetup = require('../tools/content_setup');

// Adds what the Modding Tools Content is missing for the level editor's tools to work
module.exports = async function taskSetupContent() {

    try {
        let contentDir = await modTools.getContentDir();
        let written = contentSetup.setup(contentDir);

        if (written.length > 0) {
            console.log(`Added ${written.join(', ')}. Compile the project in ToolCenter and restart the level editor to use it.`);
        }
        else {
            console.log(`Nothing is missing`);
        }
    }
    catch (error) {
        print.error(error);
        return { exitCode: 1, finished: true };
    }

    return { exitCode: 0, finished: true };
};
