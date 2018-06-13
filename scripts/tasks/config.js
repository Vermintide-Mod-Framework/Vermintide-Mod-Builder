const config = require('../config');

module.exports = async function taskConfig() {

    config.setData();

    try {
        await config.writeData();
    }
    catch (err) {
        console.error(err);
        console.error(`Couldn't save config`);
        return { exitCode: 1, finished: false };
    }

    console.log(config.getData());

    return { exitCode: 0, finished: false };
};
