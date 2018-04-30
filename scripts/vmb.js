
// vmb driver
async function vmb() {

    // Read command line parameters
    const cl = require('./cl');

    // Init tasks
    let tasks = require('./tasks');
    let taskManager = require('./task_manager');
    taskManager.init(tasks);

    // Get current task from commandline
    const { taskName, plainArgs } = taskManager.getCurrentTask(cl.argv._);

    // Read config from file
    const config = require('./config');
    await config.readData('.vmbrc', cl.argv);

    if (!config.data) {
        process.exit();
    }

    // Early execution and exit for certain tasks
    if (taskName == 'default' || taskName == 'config') {
        await taskManager.runTask(taskName, cl.argv, plainArgs);
        process.exit();
    }

    // Parse config data
    await config.parseData(cl.argv);

    // Run task
    await taskManager.runTask(taskName, cl.argv, plainArgs);
}

module.exports = vmb;
