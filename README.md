## VMF Build Script

I made a few gulp tasks to ease the ever growing pain of creating and rebuilding mods. 
Gulp is like make only in javascript and for web development. 
Why is it used for this then? Because that's what I know.

### Installation

Required paths are acquired from the registry, but fallback values can be specified by hand in gulpfile.js: 
	
	const FALLBACK_STINGRAY_EXE = '.../SteamApps/common/Warhammer End Times Vermintide Mod Tools/bin/stingray_win64_dev_x64.exe'
	const FALLBACK_WORKSHOP_DIR = '.../SteamApps/workshop/content/235540'

[Node.js](https://nodejs.org/en/) must be installed.  
Run npm (included in node.js) from where you put this to install dependencies:

	npm install gulp-cli -g
	npm i

### Usage

#### To create a mod from template:

	gulp create -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]

This will copy the template from `%%template` folder to a new folder, upload an empty mod to the workshop, add its item id to `item.cfg` in the new mod folder and open a browser window for you to subscribe to the mod.  
This is needed for building the mod.

#### To upload a mod to the Steam Workshop:

	gulp upload -m <mod_name> [-n <changenote>] [--open] [--skip]  

This will use `item.cfg` in the mod's folder. Seems to only update the mod if the content has changed.  
`-changenote` or `-n`- list of changes made  
`--open` or `-o` - opens the mod's url after uploading  
`--skip` or `-s` - only uploads the contents of `item.cfg`  
I can't be bothered to add parameters to change the title, description etc, you can simply edit `item.cfg` file.  

#### To open mod's Steam Workshop page:  

	gulp open -m <mod_name>  

#### To build all or specified mods from current directory:
	
	gulp build [-m "<mod1>; <mod2>; <mod3>"] [--verbose] [--temp] [--id <item_id>]

#### To automatically build all or specified mods from current directory:

	gulp watch [-m "<mod1>; <mod2>; <mod3>"] [--verbose] [--temp] [--id <item_id>]

Both of these will build and copy the bundle to the dist folder, as well as replace the old bundle in Steam Workshop folder with the new one. 
`item.cfg` needs to be in the folder with mod's source code and have `published_id` line.  
`--verbose` - prints stingray executable console output  
`--temp` or `-t` - overwrites the .temp folder instead of deleting it (builds faster)  
`--id` - forces item id. This way you can build a mod without having an `item.cfg` file in its folder. Can only be passed if building one mod.
