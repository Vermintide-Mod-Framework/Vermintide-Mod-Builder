const fs = require('fs');

const path = require('../lib/path');

// Adds what the Modding Tools Content is missing for the level editor's tools to work.
//
// editor_requires.lua: the level editor loads it from the project when it starts, before its plugins
// (sdk/core/editor_slave/level_editor/boot.lua). The game's own boot loads these scripts first, and the editor's
// bake tools, the Ledgelator and the Path Generator, run game scripts that use them. The Modding Tools Content
// doesn't have the file, so without it those tools stop with errors such as "attempt to index global 'DLCUtils'".

const EDITOR_REQUIRES = 'editor_requires.lua';

const EDITOR_REQUIRES_TEXT =
`-- Loaded by the level editor when it starts (sdk/core/editor_slave/level_editor/boot.lua), before its plugins.
-- The game's own boot loads these first, and the editor's bake tools use them too: DLCUtils in the game scripts they load,
-- and printf, fassert, table.tostring and table.dump in the Path Generator.
pcall(require, "scripts/settings/dlc_settings")
require "scripts/helpers/dlc_utils"
require "foundation/scripts/util/misc_util"
require "foundation/scripts/util/error"
require "foundation/scripts/util/table"
`;

// Writes the missing files to contentDir, the project folder. Returns the names of the files written.
function setup(contentDir) {
    let written = [];

    let editorRequires = path.combine(contentDir, EDITOR_REQUIRES);
    if (!fs.existsSync(editorRequires)) {
        fs.writeFileSync(editorRequires, EDITOR_REQUIRES_TEXT);
        written.push(EDITOR_REQUIRES);
    }

    return written;
}

module.exports = { setup };
