const child_process = require('child_process');

module.exports = {

    // Returns a promise with specified registry entry value
    get: async function get(key, value) {

        let spawn = child_process.spawn(
            'REG',
            ['QUERY', `"${key}"`, '/v', `"${value}"`],
            { windowsVerbatimArguments: true }
        );

        let result = '';

        spawn.stdout.on('data', data => {
            result += String(data);
        });

        return await new Promise((resolve, reject) => {

            spawn.on('error', err => {
                reject(err);
            });

            spawn.on('close', code => {

                if (code || !result) {
                    reject(code);
                    return;
                }

                try {
                    result = result.split('\r\n')[2].split('    ')[3];
                }
                catch (err) {
                    reject(`Unexpected REG QUERY output:\n${result}`);
                }

                resolve(result);
            });
        });
    },

    set: function(){
        throw `Not implemented`;
    }
};
