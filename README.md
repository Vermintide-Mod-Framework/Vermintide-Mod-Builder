## Vermintide Mod Builder  

A Windows CLI program created to ease the ever-growing pain of creating and rebuilding mods for Vermintide. Works for both Vermintide 1 and 2.    
Made in [Node.js](https://nodejs.org/en/). Compiled with [pkg](https://github.com/zeit/pkg).

### Prerequisites

1. Vermintide Mod SDK must be installed. Look for *"Warhammer: End Times - Vermintide Mod SDK Pre-Alpha"* for Vermintide 1 and *"Warhammer: Vermintide 2 SDK (Alpha)"* for Vermintide 2 in the Tools section in your Steam library.  
5. [V2 ONLY] Switch Vermintide 2 Mod SDK to the *latest* branch in Properties > Betas.  
4. [V1 ONLY] For now, to enable mods in the launcher, find `launcher.config` in `%AppData%\Fatshark\Warhammer End Times Vermintide` and set `ModsEnabled` to `true`, or add `ModsEnabled = true` if it is missing.  
3. Steam must be running for creating, publishing and uploading mods. 
4. Subscribe to Vermintide Mod Framework on Steam workshop ([V1 version](https://steamcommunity.com/sharedfiles/filedetails/?id=1289946781), [V2 version](https://steamcommunity.com/sharedfiles/filedetails/?id=1369573612)) and make sure that it is the first mod in the list in the launcher if you want VMF-dependent mods to work.

### Quickstart Guide

1. Download and export **[the latest release](http://goo.gl/Jm1icg)**.  
2. Run vmb.exe to create default .vmbrc config file in the folder with the executable.  
3. Set `game` in .vmbrc to 1 or 2 to determine for which game mods are going to be created, built and uploaded by default.   
4. Run `vmb create <mod_name>` to create a new mod. This will create a new VMF-dependent mod in the `mods` folder from a template and then open a steam workshop page where you will have to subscribe to the mod in order for the game to recognize it. Note that the mod you're subscribing to is not functional at this stage and will prevent you from entering the game until you build it properly.   
5. The main functionality of your mod should be added to `<mod_name>/scripts/mods/<mod_name>/<mod_name>.lua`.  
6. To build the mod, run `vmb build <mod_name>`.  
7. To upload an updated version of your mod, run `vmb upload <mod_name>`.  
8. To re-publish a mod if you deleted it from the workshop, or to publish it for another game, run `vmb publish <mod_name> -g {1|2}`.


### Usage

	vmb <command> [command-specific params] [-f <mods_folder>] [-g {1|2}] [--cfg <path_to_item_cfg>] [--rc <config_folder>] [--reset] [--use-fallback] [--cwd]

`-f <mods_folder>` or `--folder <mods_folder>` - temporarily sets current mods folder. This path can be relative or absolute. If the path isn't absolute, it will be relative to the current working directory. The path must already exist. To use current working directory put `.` as the path.   
`-g {1|2}` or `--game {1|2}` - temporarily sets for which game the mods should be created, built and uploaded.  
`--cfg <path_to_item_cfg>` - path to .cfg file that stores information about a mod. Can be relative or absolute. If not set to absolute, it will be relative to each mod's directory. Defaults to `itemV1.cfg` and `itemV2.cfg` depending on selected game.  
`--rc <config_folder>` - folder with .vmbrc. Can be relative or absolute. If not set to absolute, it will be relative to the current working directory. By default, it is the directory with vmb.exe. The path must already exist. To use current working directory put `.` as the path. If the file doesn't exist in the folder, a default config will be created.      
`--reset` - resets .vmbrc before executing the command.  
`--use-fallback` - uses fallback paths instead of looking them up in the registry. Can speed up building/uploading. You can also permanently set this in .vmbrc.  
`--cwd` - forces all paths which are relative to the executable's directory to be relative to the current working directory instead. See **[relative paths clarification](#relative-paths-clarification)**.

Run without command to see version number and a list of commands with parameters.


#### Create a mod from template:

	vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v {private|public|friends}] [--tags "<tag1>; <tag2>;..."] [--template <template_folder>]

This will copy the template from specified template folder (either in .vmbrc or via the parameter) to a new folder, upload a placeholder mod to the workshop (the item is private by default), add its item ID to `itemV1.cfg` or `itemV2.cfg` (depending on which game is specified in the .vmbrc) in the new mod folder and open a browser window for you to subscribe to the mod.  
This is needed for the game to recognize the mod.  
By default, the template is for VMF-dependent mods. To create a VMF-independent mod specify `.template` as the template. See [Mod Templates](#mod-templates).

#### Publish an existing mod to Steam Workshop:  

	vmb publish <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v {private|public|friends}] [--tags "<tag1>; <tag2>;..."] [--ignore-errors] [--verbose] [--clean]

This will create `itemV1.cfg` or `itemV2.cfg`  for a mod if it doesn't exist then build and publish the mod to workshop as a new item.
If .cfg file is present it shouldn't have `published_id` in it.  

#### Upload a new version of a mod to Steam Workshop:  

	vmb upload {<mod_name1> <mod_name2>... | --all}  [-n <changenote>] [--open] [--skip]  

This will use `itemV1.cfg` or `itemV2.cfg` in the mod's folder (if not overwritten by `--cfg`) and upload the last built version. Workshop seems to only update the mod if the content was changed.  
If multiple mods are specified, they will all be uploaded with the same changenote.  
`--all` - must be set in order to upload all mods.  
`--changenote` or `-n`- list of changes made  
`--open` or `-o` - opens the mod's url after uploading  
`--skip` or `-s` - only uploads the contents of .cfg  
I can't be bothered to add parameters to change the title, description etc. You can simply edit .cfg file.  

#### Open an existing mod's page on Steam Workshop:  

	vmb open {<mod_name> | --id <item_id>}  

#### Build all or specified mods from current directory:
	
	vmb build [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>] [--no-workshop] 

#### Automatically build all or specified mods from current directory on changes:

	vmb watch [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--clean] [--id <item_id>] [--no-workshop]

Two of the commands above will build and copy the bundle to the bundleV1 or bundleV2 folder, as well as replace the old bundle in Steam Workshop folder with the new one. If no mod name is specified, all mods will be built/watched.  
`itemV1.cfg` or `itemV2.cfg` needs to be in the folder with mod's source code and have `published_id` line.  
`--verbose` - prints Stingray executable console output.  
`--ignore-errors` or `--ignore-build-errors` or `-e` - ignores Stingray executable errors and tries to copy the built bundle anyway.
You can also enable this parameter by default by setting `ignore_build_errors` in .vmbrc to true.  
`--clean` - deletes the temp folder instead of overwriting it (builds slower, use to force building from scratch).  
`--id` - forces item ID. This way you can build a mod without having a .cfg file in its folder. Can only be passed if building one mod.  
`--no-workshop` - this will build the mod even if .cfg file isn't present but will only copy it to the bundle folder in mod's folder.

#### Quickly change configuration in .vmbrc:  
	
	vmb config [--<key1>=<value1> --<key2>=<value2>...]

This will also print the contents of the .vmbrc file.
Note that you can only set string, number and boolean-type options this way.  

#### Show information about all or some mods:  

    vmb info [<mod_name1> <mod_name2>...] [--cfg]

This will show the full path to the mod's folder, whether the mod has been published, when it was last built and whether `itemVX.cfg` file is present.  
`--cfg` will also print the contents of the `itemVX.cfg` file.

### Configuration  

The program reads configuration file .vmbrc every time it starts. Some of these options can be temporarily overwritten with command line parameters described above. Below are some of the options and their default values.   

* **`"mods_dir": "./mods"`** - folder in which mods are going to be searched for. This path can be relative or absolute. If the path isn't absolute, it will be relative to the current working directory. The path must already exist. To use current working directory put `.` as the path.  
* `"temp_dir": ""` - folder where temporary files will be placed during the build process. Leaving it empty will default to `<mods_dir>/.temp`. If not set to an absolute path, it will be relative to the current working directory, just like `mods_dir`. Unlike `mods_dir`, this path doesn't have to exist prior to running the program.   
* **`"game": 2`** - set to 1 or 2 to determine for which game the mods are going to be created, built and uploaded by default.  
* `"fallback_tools_dir{1|2}": "C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/"` - these paths will be used as a fallback for Vermintide SDK folders if the script fails to find them in the registry.  
* `"fallback_steamapps_dir1{1|2}": "C:/Program Files (x86)/Steam/steamapps/"` - these paths will be used as a fallback for the SteamApps folders if the script fails to find them in the registry.  
* **`"use_fallback": false`** - set to `true` to use fallback paths instead of looking them up in the registry. Can speed up building/uploading.  
* `"ignored_dirs": [ ".git", ".temp" ]` - folders in `<mods_dir>` that will be ignored when building/watching all mods.  
* `"ignore_build_errors": false` - set to `true` to ignore Stingray executable errors during the build process.  
* 	`"template_dir": ".template-vmf", "template_preview_image": "item_preview.jpg", "template_core_files": [ "core/**" ]` - see [Mod Templates](#mod-templates).  


### Mod Templates  
When creating a mod, a template folder will be copied to act as a boilerplate for your mod.
You can customize this template or create your own.  

* The template folder is determined by `template_dir` in .vmbrc. This path can be relative or absolute. If not absolute, it will be relative to the directory of the executable.   
* Certain strings will be replaced with their corresponding values when creating a new mod.
These are `%%name`, `%%title` and `%%description` for content of files and `%%name` for names of files and folders.  
* Files which should be excluded from such alteration can be specified in `template_core_files`. They will simply be copied over.  

Every template must have `item_preview.jpg` in it as that is used for the mod preview picture. If you want to change the name or the format of this file, specify it in .vmbrc -> `template_preview_image`. 

### Relative paths clarification

To provide convenience both to people who want to use vmb out of the box and people who want to configure it/add it to PATH/use multiple configs, some paths are treated differently:  

* `mods_dir` and `temp_dir` are relative to the current working directory.  
* `template_dir` is relative to the directory with vmb.exe.  
* `.vmbrc` folder is relative to the current working directory but defaults to the vmb.exe folder when not overwritten by the `--rc` argument.
* `--cfg` path to item cfg file is relative to each mod's directory.  

You can use `--cwd` flag to force all paths which are relative to the executable's directory to be relative to the current working directory instead. You only need to use this flag if you're running vmb from the source code (via node.exe).

### Building VMB executable

	npm run setup   
	npm run build

The compiler will say that some file needs to be distributed with the executable, but that is only relevant for non-win platforms and I'm pretty sure this script doesn't work under anything but Windows anyway.  
Along with the executable, a zip archive will be created with template and mods folders included.

### Tests

    npm test
