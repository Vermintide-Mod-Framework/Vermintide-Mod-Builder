const print = require('../print');

const config = require('../modules/config');

module.exports = async function taskConfig() {

    // Set config data based on cl args
    config.setData();

    // Write config data to file
    try {
        await config.writeData();
    }
    catch (err) {
        print.error(err);
        print.error(`Couldn't save ${config.get('filename')}`);
        return { exitCode: 1, finished: false };
    }

    // Print config data
    console.log(config.getData());

    return { exitCode: 0, finished: false };
};
