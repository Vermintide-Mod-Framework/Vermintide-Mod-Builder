## Vermintide Mod Builder  

I made a script to ease the ever-growing pain of creating and rebuilding mods
and compiled it into a 30mb executable for ease of use.  
The executable is the full [Node.js](https://nodejs.org/en/) enviroment
and the script uses [gulp](https://gulpjs.com/) which is like make for javascript.
Compiled with [pkg](https://github.com/zeit/pkg).  
I'm pretty sure you're not supposed to do any of this but what the hell, it works.

This script works for both Vermintide 1 and 2. 

### Installation  

1. Download and export **[the latest release](https://www.dropbox.com/s/6prr4d5lsl4q2q8/vmb.zip?dl=1)**.  
2. Run vmb.exe to create default .vmbrc config file.  
2. Place your existing mods in the `mods` folder or specify alternative path in .vmbrc -> `mods_dir`. This path can be relative or absolute. The path must already exist. To use current folder put `.` as the path.  
3. Set `game` in .vmbrc to 1 or 2 to determine for which game mods are gonna be built and uploaded by default.  
3. Set `fallback_tools_dir` and `fallback_workshop_dir` in .vmbrc for both games. These paths will be used if the script fails to find them in the registry. You can leave these untouched or remove them, then the standard fallback will be used.  
4. You can add folders that will be ignored when building/watching all mods to `ignored_dirs` in .vmbrc.   
5. You can also set `temp_dir` to specify where temporary files will be placed during the build process. Leaving it empty will default to `<mods_dir>/.temp`. Unlike `mods_dir`, this path doesn't have to exist prior to running the program.  


### Usage

	vmb <command> [command-specific params] [-f <folder>] [-g <game_number>] [--rc <filename>] [--reset]

`-f <folder>` or `--folder <folder>` - temporarily sets current mods folder  
`-g <game_number>` or `--game <game_number>` - temporarily sets which game should the mods be built/uploaded for  
`--rc <filename>` -  path to file to use as config instead of .vmbrc  
`--reset` - resets .vmbrc before executing the command  

Run without command to see a list of commands with parameters.


#### Create a mod from template:

	vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]

This will copy the template from specified template folder (either in .vmbrc or via the parameter) to a new folder, upload an empty mod to the workshop (the item is private by default), add its item ID to `itemV1.cfg` or `itemV2.cfg` (depending on which game is specified in the .vmbrc) in the new mod folder and open a browser window for you to subscribe to the mod.  
This is needed for the game to recognize the mod.  
Be default the template is for mods that work under VMF. To create a VMF-independent mod specify `.template` as the template.

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

* The template folder is determined by `template_dir` in .vmbrc. This path can be relative or absolute.  
* Certain strings will be replaced with their corresponding values when creating a new mod.
These are `%%name`, `%%title` and `%%description` for content of files and `%%name` for names of files and folders.  
* Files which should be excluded from such alteration can be specified in `template_core_files`. They will simply be copied over.  

Every template must have `item_preview.jpg` in it as that is used for the mod preview picture. If you want to change the name or the format of this file, specify it in .vmbrc -> `template_preview_image`. 

### Compiling VMB executable

	npm run setup   
	npm run compile

The compiler will say that some file needs to be distributed with the executable, but that is only relevant for non-win platforms and I'm pretty sure this script doesn't work under anything but Windows anyway.  
Along with the executable, a zip archive will be created with template and mods folders included.
