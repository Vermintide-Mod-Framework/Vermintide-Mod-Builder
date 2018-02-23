## Gulp commands

I made a few gulp tasks to ease the pain of creating and rebuilding mods.  

Required paths are acquired from the registry, but fallback values can be specified by hand in gulpfile.js: 
	
	const fallbackStingrayExe = // <Vermintide mod tools folder>/bin/stingray_win64_dev_x64.exe
	const fallbackModsDir = // <Vermintide folder>/bundle/mods

Node.js must be installed.  
Run npm (included in node.js) to install dependencies:

	npm install gulp-cli -g
	npm i

To create a mod from template (%%template folder):

	gulp create -m <mod_name> [-a <Author>]

To build all or specified mods from current directory:
	
	gulp build [-m "<mod_name1>; <mod_name2>..."] [--verbose] [--temp]

To automatically build all or specified mods from current directory:

	gulp watch [-m "<mod_name1>; <mod_name2>..."] [--verbose] [--temp]

`--verbose` - prints stingray executable console output even if the mod builds succesfully  
`--temp` or `-t` - doesn't delete the temp folder  
