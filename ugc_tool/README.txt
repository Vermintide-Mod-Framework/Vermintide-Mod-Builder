
Usage: 
------

ugc_tool.exe -c path/to/config.cfg
	
	-c config_file		Required. The config file describing the workshop item.
	-n "change note"	Optional. The change note that will be shown for the update
	-s 					Optional. Skips updating the content and preview file.
								  Use this for faster updates when only non-content
								  parameters needs to change.
							
							
Config file.
------------
The config files layout is as follows:

title = "The Item Title";
description = "The Item Description";
preview = "preview.jpg";
content = "content";
language = "english";
visibility = "private";
published_id = 0000000000L;


Legend:
-------

title : string
	The title of the workshop item.
	
description : string
	The description of the workshop item.
	
preview : string
	The path to the preview file. Is relative to the config file location, or
	can be an absolute path. preview file needs to be less then 1MB, formats
	include Jpg, Png and Gif.
	
content : string
	The path to the content directory. Is relative to the config file location, or
	can be an absolute path. There must be some sort of content in the folder.
	
language : string
	Sets the language of the title and description that will be set in this item update.
	This must be in the format of the API language code. (https://partner.steamgames.com/doc/store/localization#supported_languages)

visibility : string
	Sets the visibility of a workshopitem.
	"private" Only visible to the creator.
	"friends" Visible to friends only.
	"public"  Visible to everyone.

published_id : int64
	This field is populated by the tool when ran the first time and the workshopitem is created.
	It holds the id of the workshop item for succeeding updates. Leave this field out
	or set it to 0L in a new config file. Do not modify once it's set.
	If you delete a workshop item and want to re upload it, set this to 0 before running
	to create a new workshop item.
	



