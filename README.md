## VMF Build Script

I made a few gulp tasks to ease the ever growing pain of creating and rebuilding mods. 
Gulp is like make only in javascript and for web development. 
Why is it used for this then? Because that's what I know.

### Installation

1. [Node.js](https://nodejs.org/en/) must be installed.  
1. Run npm (included in node.js) from where you put this to install dependencies:  

	npm install gulp-cli -g  
	npm i  

1. Run `gulp` from command line to create config.json file.  
2. Place your existing mods in the `mods` folder or specify alternative path in config.json. This path can be relative or absolute. To use current folder specify `.` as the path.  
3. Set `fallback_stingray_exe` and `fallback_workshop_dir` in config.json. These paths will be used if the script fails to find them in the registry.  
4. You can add folders that will be ignored when building/watching all mods to `ignored_dirs` in config.json.   
5. You can also set `temp_dir` to specify where temporary files will be placed during the build process. Leaving it empty will default to `<mods_dir>/.temp`.

### Usage

All of these commands have the optional `-f <folder>` param that temporaly sets current mods folder.

#### Create a mod from template:

	gulp create -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]

This will copy the template from `%%template` folder to a new folder, upload an empty mod to the workshop (the item is private by default), add its item ID to `item.cfg` in the new mod folder and open a browser window for you to subscribe to the mod.  
This is needed for building the mod.

#### Publish an existing mod to Steam Workshop:  

	gulp publish -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]

This will create `item.cfg` for a mod if it doesn't exist then build and publish the mod to workshop as a new item.
If `item.cfg` is present it shouldn't have `published_id` in it.  

#### Upload a new version of a mod to Steam Workshop:  

	gulp upload -m <mod_name> [-n <changenote>] [--open] [--skip]  

This will use `item.cfg` in the mod's folder and upload the last built version. Seems to only update the mod if the content has changed.  
`--changenote` or `-n`- list of changes made  
`--open` or `-o` - opens the mod's url after uploading  
`--skip` or `-s` - only uploads the contents of `item.cfg`  
I can't be bothered to add parameters to change the title, description etc, you can simply edit `item.cfg` file.  

#### Open an existing mod's page on Steam Workshop:  

	gulp open {-m <mod_name> | --id <item_id>}  

#### Build all or specified mods from current directory:
	
	gulp build [-m "<mod1>; <mod2>; <mod3>..."] [--verbose] [--temp] [--id <item_id>] [--dist]

#### Automatically build all or specified mods from current directory:

	gulp watch [-m "<mod1>; <mod2>; <mod3>..."] [--verbose] [--temp] [--id <item_id>] [--dist]

Both of these will build and copy the bundle to the dist folder, as well as replace the old bundle in Steam Workshop folder with the new one. 
`item.cfg` needs to be in the folder with mod's source code and have `published_id` line.  
`--verbose` - prints stingray executable console output  
`--temp` or `-t` - overwrites the .temp folder instead of deleting it (builds faster)  
`--id` - forces item ID. This way you can build a mod without having an `item.cfg` file in its folder. Can only be passed if building one mod.  
`--dist` - this will build the mod even if item.cfg isn't present but will only copy it to the `dist` folder in mod's folder
