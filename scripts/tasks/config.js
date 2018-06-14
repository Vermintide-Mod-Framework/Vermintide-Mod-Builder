const config = require('../config');
const print = require('../print');

module.exports = async function taskConfig() {

    config.setData();

    try {
        await config.writeData();
    }
    catch (err) {
        print.error(err);
        print.error(`Couldn't save config`);
        return { exitCode: 1, finished: false };
    }

    console.log(config.getData());

    return { exitCode: 0, finished: false };
};
