## Vermintide Mod Builder  

I made a script to ease the ever-growing pain of creating and rebuilding mods
and compiled it into a 30mb executable for ease of use.  
The executable is the full [Node.js](https://nodejs.org/en/) enviroment
and the script uses [gulp](https://gulpjs.com/) which is like make for javascript.
Compiled with [pkg](https://github.com/zeit/pkg).  
I'm pretty sure you're not supposed to do any of this but what the hell, it works.

This script works for both Vermintide 1 and 2. 

### Prerequisites

1. Vermintide Mod SDK must be installed. Look for it in the Tools section in your Steam library.  
2. For now, you will need to switch the SDK between branches to build mods for Vermintide 1 or 2. To do this, right click on the SDK in your Steam library, go to Properties -> Betas and select NONE for Vermintide 1 or vermintide2_\<version\> for Vermintide 2.  
4. For now, to enable mods in the launcher, find `launcher.config` in `%AppData%\Fatshark\Warhammer End Times Vermintide` or `%AppData%\Fatshark\Vermintide 2` and set `ModsEnabled` to `true`, or add `ModsEnabled = true` if it is missing.  
3. Steam must be running for creating, publishing and uploading of mods to work.  

### Installation  

1. Download and export **[the latest release](https://www.dropbox.com/s/6prr4d5lsl4q2q8/vmb.zip?dl=1)**.  
2. Run vmb.exe to create default .vmbrc config file in the folder with the executable.  
2. Place your existing mods in the `mods` folder or specify alternative path in .vmbrc -> `mods_dir`. This path can be relative or absolute. If the path isn't absolute, it will be relative to the current working directory. The path must already exist. To use current working directory put `.` as the path.  
3. Set `game` in .vmbrc to 1 or 2 to determine for which game mods are gonna be built and uploaded by default.  
3. Set `fallback_tools_dir` and `fallback_workshop_dir` in .vmbrc for both games. These paths will be used if the script fails to find them in the registry. You can leave these untouched or remove them, then the standard fallback will be used.  
4. You can add folders that will be ignored when building/watching all mods to `ignored_dirs` in .vmbrc.   
5. You can also set `temp_dir` to specify where temporary files will be placed during the build process. Leaving it empty will default to `<mods_dir>/.temp`. If not set to an absolute path, it will be relative to the current working directory, just like `mods_dir`. Unlike `mods_dir`, this path doesn't have to exist prior to running the program. 


### Usage

	vmb <command> [command-specific params] [-f <mods_folder>] [-g <game_number>] [--rc <config_folder>] [--reset] [--cwd]

`-f <mods_folder>` or `--folder <mods_folder>` - temporarily sets current mods folder.  
`-g <game_number>` or `--game <game_number>` - temporarily sets which game should the mods be built/uploaded for.  
`--rc <config_folder>` - folder with .vmbrc. Can be relative or absolute. If not set to absolute, it will be relative to the current working directory. By default it is the directory with vmb.exe. Folder must exist. If the file doesn't exist in the folder, a default config will be created.    
`--reset` - resets .vmbrc before executing the command.  
`--cwd` - forces all non-absolute paths to be relative to the current working directory. See **[relative paths clarification](#relative-paths-clarification)**.

Run without command to see a list of commands with parameters.


#### Create a mod from template:

	vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]

This will copy the template from specified template folder (either in .vmbrc or via the parameter) to a new folder, upload an empty mod to the workshop (the item is private by default), add its item ID to `itemV1.cfg` or `itemV2.cfg` (depending on which game is specified in the .vmbrc) in the new mod folder and open a browser window for you to subscribe to the mod.  
This is needed for the game to recognize the mod.  
By default the template is for mods that work under VMF. To create a VMF-independent mod specify `.template` as the template.

#### Publish an existing mod to Steam Workshop:  

	vmb publish <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--ignore-errors] [--verbose] [--temp]

This will create `itemV1.cfg` or `itemV2.cfg`  for a mod if it doesn't exist then build and publish the mod to workshop as a new item.
If .cfg file is present it shouldn't have `published_id` in it.  

#### Upload a new version of a mod to Steam Workshop:  

	vmb upload <mod_name> [-n <changenote>] [--open] [--skip]  

This will use `itemV1.cfg` or `itemV2.cfg` in the mod's folder and upload the last built version. Seems to only update the mod if the content has changed.  
`--changenote` or `-n`- list of changes made  
`--open` or `-o` - opens the mod's url after uploading  
`--skip` or `-s` - only uploads the contents of .cfg  
I can't be bothered to add parameters to change the title, description etc. You can simply edit .cfg file.  

#### Open an existing mod's page on Steam Workshop:  

	vmb open {<mod_name> | --id <item_id>}  

#### Build all or specified mods from current directory:
	
	vmb build [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist] 

#### Automatically build all or specified mods from current directory:

	vmb watch [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]

Two of the commands above will build and copy the bundle to the dist folder, as well as replace the old bundle in Steam Workshop folder with the new one. If no mod name is specified, all mods will be built/watched.  
`itemV1.cfg` or `itemV2.cfg` needs to be in the folder with mod's source code and have `published_id` line.  
`--verbose` - prints stingray executable console output.  
`--ignore-errors` or `--ignore-build-errors` or `-e` - ignores stingray executable errors and tries to copy the built bundle anyway.
You can also enable this parameter by default by setting `ignore_build_errors` in .vmbrc to true.  
`--temp` - deletes the temp folder instead of overwriting it (builds slower, use to force building from scratch).  
`--id` - forces item ID. This way you can build a mod without having a .cfg file in its folder. Can only be passed if building one mod.  
`--dist` - this will build the mod even if .cfg file isn't present but will only copy it to the `dist` folder in mod's folder.

#### To quickly change options in .vmbrc 
	
	vmb config [--<key1>=<value1> --<key2>=<value2>...]

This will also print the contents of the .vmbrc file.
Note that you cannot set non-string or non-number options this way.

### Mod templates  
When creating a mod, a template folder will be copied to act as a boilerplate for your mod.
You can customize this template or create your own.  

* The template folder is determined by `template_dir` in .vmbrc. This path can be relative or absolute. If not absolute, it will be relative to the directory of the executable.   
* Certain strings will be replaced with their corresponding values when creating a new mod.
These are `%%name`, `%%title` and `%%description` for content of files and `%%name` for names of files and folders.  
* Files which should be excluded from such alteration can be specified in `template_core_files`. They will simply be copied over.  

Every template must have `item_preview.jpg` in it as that is used for the mod preview picture. If you want to change the name or the format of this file, specify it in .vmbrc -> `template_preview_image`. 

### Relative paths clarification

To provide convenience both to people who want to use vmb out of the box and people who want to configure it/add it to PATH/use multiple configs, relative paths to mods directory, temp directory, template directory and config file are treated differently:  

* `mods_dir` and `temp_dir` are relative to the current working directory.  
* `template_dir` is relative to the directory with vmb.exe.  
* `.vmbrc` folder is relative to the current working directory but defaults to the vmb.exe folder when not overwritten by the `--rc` argument.

You can use `--cwd` flag to force all non-absolute paths to be relative to the current working directory.

### Compiling VMB executable

	npm run setup   
	npm run compile

The compiler will say that some file needs to be distributed with the executable, but that is only relevant for non-win platforms and I'm pretty sure this script doesn't work under anything but Windows anyway.  
Along with the executable, a zip archive will be created with template and mods folders included.
