const pfs = require('./pfs');
const path = require('./path');

const defaultTempDir = '.temp';

let config = {
    defaultTempDir,

    defaultData: {
        mods_dir: 'mods',
        temp_dir: '',

        game: 1,

        game_id1: '235540',
        game_id2: '552500',

        tools_id1: '718610',
        tools_id2: '718610',

        fallback_tools_dir1: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',
        fallback_tools_dir2: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',

        fallback_workshop_dir1: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/',
        fallback_workshop_dir2: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/',

        template_dir: ".template-vmf",

        template_core_files: [
            'core/**'
        ],

        ignored_dirs: [
            '.git',
            defaultTempDir
        ],

        ignore_build_errors: false
    },

    filename: '',

    data: {},

    modsDir: '',
    tempDir: '',
    gameNumber: 0,

    // Other config params
    fallbackToolsDir: '',
    fallbackWorkshopDir: '',
    ignoredDirs: [],

    // These will be replaced in the template mod when running tasks
    templateDir: '',
    templateName: '%%name',
    templateTitle: '%%title',
    templateDescription: '%%description',
    itemPreview: 'item_preview.jpg',

    // Folder in which the built bundle is gonna be stored before being copied to workshop folder
    distDir: 'dist',

    // Files in template
    coreSrc: [],
    modSrc: [],

    // Paths to mod tools relative to the mod tools folder
    uploaderDir: 'ugc_uploader/',
    uploaderExe: 'ugc_tool.exe',
    uploaderGameConfig: 'steam_appid.txt',
    stingrayDir: 'bin/',
    stingrayExe: 'stingray_win64_dev_x64.exe',

    // Config file for workshop uploader tool
    cfgFile: '',

    async init(filename, args) {
        this.filename = filename;
        this.data = await readScriptConfig(this.filename, args.reset);

        // Mods directory
        let { modsDir, tempDir } = await this.getModsDir(this.data.mods_dir, this.data.temp_dir, args);
        this.modsDir = modsDir;
        this.tempDir = tempDir;

        // Game number
        this.gameNumber = this.getGameNumber(this.data.game, args);

        // Other config params
        this.fallbackToolsDir = path.fix(this.getGameSpecificKey('fallback_tools_dir') || '');
        this.fallbackWorkshopDir = path.combine(this.getGameSpecificKey('fallback_workshop_dir') || '', this.getGameId());
        this.ignoredDirs = this.data.ignored_dirs || [];

        this.templateDir = this.getTemplateDir(this.data.template_dir || this.defaultData.template_dir, args);

        // Files in template
        const { coreSrc, modSrc } = this.getTemplateSrc(this.data.template_core_files, this.templateDir);
        this.coreSrc = coreSrc;
        this.modSrc = modSrc;

        // Config file for workshop uploader tool
        this.cfgFile = 'itemV' + this.gameNumber + '.cfg';

        return this;
    },

    getGameSpecificKey(key){
        let id = this.data[key + this.gameNumber];
        if (typeof id != 'string') {
            console.error(`Failed to find '${key + this.gameNumber}' in ${this.filename}.`);
            process.exit();
        }
        return id;
    },

    getGameId() {
        return this.getGameSpecificKey('game_id');
    },

    getToolsId() {
        return this.getGameSpecificKey('tools_id');
    },

    async getModsDir(modsDir, tempDir, args) {

        modsDir = (typeof modsDir == 'string' && modsDir !== '') ? path.fix(modsDir) : 'mods';
        tempDir = (typeof tempDir == 'string' && tempDir !== '') ? path.fix(tempDir) : '';

        let unspecifiedTempDir = !tempDir;
        if (unspecifiedTempDir) {
            tempDir = path.combine(modsDir, defaultTempDir);
        }

        let newModsDir = args.f || args.folder;

        if (!newModsDir) {
            console.log(`Using mods folder "${modsDir}"`);
            console.log(`Using temp folder "${tempDir}"`);
        }
        else {
            if (typeof newModsDir == 'string') {
                modsDir = path.fix(newModsDir);
                console.log(`Using mods folder "${modsDir}"`);
                if (unspecifiedTempDir) {
                    tempDir = path.combine(modsDir, defaultTempDir);
                }
            }
            else {
                console.warn(`Couldn't set mods folder "${newModsDir}", using default "${modsDir}"`);
            }
            console.log(`Using temp folder "${tempDir}"`);
        }

        if (!await pfs.accessible(modsDir + '/')) {
            console.error(`Mods folder "${modsDir}" doesn't exist`);
            process.exit();
        }

        return { modsDir, tempDir };
    },

    getGameNumber(gameNumber, args) {
        let newGameNumber = args.g || args.game;

        if (newGameNumber !== undefined) {
            gameNumber = newGameNumber;
        }

        gameNumber = Number(gameNumber);

        if (gameNumber !== 1 && gameNumber !== 2) {
            console.error(`Vermintide ${gameNumber} hasn't been released yet. Check your ${this.filename}.`);
            process.exit();
        }

        console.log('Game: Vermintide ' + gameNumber);

        return gameNumber;
    },

    getTemplateDir(templateDir, args) {
        let newTemplateDir = args.template || '';

        if (newTemplateDir && typeof newTemplateDir == 'string') {
            return newTemplateDir;
        }

        return templateDir;
    },

    getTemplateSrc(configCoreSrc, templateDir) {

        // Static files from config
        let coreSrc = [
            path.combine(templateDir, this.itemPreview)
        ];
        if (Array.isArray(configCoreSrc)) {
            for (let src of configCoreSrc) {
                coreSrc.push(path.combine(templateDir, src));
            };
        }

        // Folders with mod specific files
        let modSrc = [
            templateDir + '/**'
        ];

        // Exclude core files from being altered
        for (let src of coreSrc) {
            modSrc.push('!' + src);
        };

        return { coreSrc, modSrc };
    },

    setData(args) {
        for (let key of Object.keys(this.data)) {

            if (args[key] === undefined) {
                continue;
            }

            if (typeof this.data[key] == 'object') {
                console.error(`Cannot set key "${key}" because it is an object. Modify ${this.filename} directly.`);
                continue;
            }

            console.log(`Set ${key} to ${args[key]}`);
            this.data[key] = args[key];
        };
    },

    async writeData() {
        await pfs.writeFile(this.filename, JSON.stringify(this.data, null, '\t'));
    }
};

async function readScriptConfig(filename, shouldReset) {

    if (shouldReset && await pfs.accessible(filename)) {
        try {
            console.log(`Deleting ${filename}`);
            await pfs.unlink(filename);
        }
        catch (err) {
            console.error(err);
            console.error(`Couldn't delete config`);
        }
    }

    if (!await pfs.accessible(filename)) {
        try {
            console.log(`Creating default ${filename}`);
            await pfs.writeFile(filename, JSON.stringify(config.defaultData, null, '\t'));
        }
        catch (err) {
            console.error(err);
            console.error(`Couldn't create config`);
        }
    }

    try {
        return JSON.parse(await pfs.readFile(filename, 'utf8'));
    }
    catch (err) {
        console.error(err);
        console.error(`Couldn't read config`);
        return null;
    }
}

module.exports = config;