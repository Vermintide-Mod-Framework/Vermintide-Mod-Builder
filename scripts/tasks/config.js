const cl = require('../cl');
const config = require('../config');

module.exports = async function configTask() {

    config.setData(cl.argv);

    try {
        await config.writeData();
    }
    catch (err) {
        console.error(err);
        console.error(`Couldn't save config`);
        return { exitCode: 1, finished: false };
    }

    console.log(config.data);

    return { exitCode: 0, finished: false };
};
