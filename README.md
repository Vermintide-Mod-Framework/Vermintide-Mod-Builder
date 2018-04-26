## VMF Build Script

I made a few gulp tasks to ease the ever-growing pain of creating and rebuilding mods. 
Gulp is like make only in javascript and for web development. 
Why is it used for this then? Because that's what I know.

This script works for both Vermintide 1 and 2. 

### Installation

1. [Node.js](https://nodejs.org/en/) must be installed.  
1. Run npm (included in node.js) from where you put this to install dependencies:  

	npm install gulp-cli -g  
	npm i  

1. Run `gulp` from command line to create config.json file.  
2. Place your existing mods in the `mods` folder or specify alternative path in config.json. This path can be relative or absolute. To use current folder put `.` as the path.  
3. Set `game` in config.json to 1 or 2 to determine for which game mods are gonna be built and uploaded by default.  
3. Set `fallback_tools_dir` and `fallback_workshop_dir` in config.json for both games. These paths will be used if the script fails to find them in the registry.  
4. You can add folders that will be ignored when building/watching all mods to `ignored_dirs` in config.json.   
5. You can also set `temp_dir` to specify where temporary files will be placed during the build process. Leaving it empty will default to `<mods_dir>/.temp`.

### Usage

	gulp <command> [command-specific params] [-f <folder>] [-g <game_number>] [--reset]

`-f <folder>` or `--folder <folder>` - temporally sets current mods folder  
`-g <game_number>` or `--game <game_number>` - temporary sets which game should the mods be built/uploaded for  
`--reset` - resets config.json before executing the command  

Run without command to see a list of commands with parameters.


#### Create a mod from template:

	gulp create -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]

This will copy the template from `%%template` folder to a new folder, upload an empty mod to the workshop (the item is private by default), add its item ID to `itemV1.cfg` or `itemV2.cfg` (depending on which game is specified in the config.json) in the new mod folder and open a browser window for you to subscribe to the mod.  
This is needed for the game to recognize the mod.

#### Publish an existing mod to Steam Workshop:  

	gulp publish -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]

This will create `itemV1.cfg` or `itemV2.cfg`  for a mod if it doesn't exist then build and publish the mod to workshop as a new item.
If .cfg file is present it shouldn't have `published_id` in it.  

#### Upload a new version of a mod to Steam Workshop:  

	gulp upload -m <mod_name> [-n <changenote>] [--open] [--skip]  

This will use `itemV1.cfg` or `itemV2.cfg` in the mod's folder and upload the last built version. Seems to only update the mod if the content has changed.  
`--changenote` or `-n`- list of changes made  
`--open` or `-o` - opens the mod's url after uploading  
`--skip` or `-s` - only uploads the contents of .cfg  
I can't be bothered to add parameters to change the title, description etc. You can simply edit .cfg file.  

#### Open an existing mod's page on Steam Workshop:  

	gulp open {-m <mod_name> | --id <item_id>}  

#### Build all or specified mods from current directory:
	
	gulp build [-m "<mod1>; <mod2>; <mod3>;..."] [--verbose] [--temp] [--id <item_id>] [--dist]

#### Automatically build all or specified mods from current directory:

	gulp watch [-m "<mod1>; <mod2>; <mod3>;..."] [--verbose] [--temp] [--id <item_id>] [--dist]

Two of the commands above will build and copy the bundle to the dist folder, as well as replace the old bundle in Steam Workshop folder with the new one. 
`itemV1.cfg` or `itemV2.cfg` needs to be in the folder with mod's source code and have `published_id` line.  
`--verbose` - prints stingray executable console output  
`--temp` or `-t` - deletes the temp folder instead of overwriting it (builds slower, use to force building from scratch)  
`--id` - forces item ID. This way you can build a mod without having a .cfg file in its folder. Can only be passed if building one mod.  
`--dist` - this will build the mod even if .cfg file isn't present but will only copy it to the `dist` folder in mod's folder

#### To quickly change options in config.json 
	
	gulp config [--<key1>=<value1> --<key2>=<value2>...]

This will also print the contents of the config.json file.  
Note that you cannot set `ignored_dirs` this way.
