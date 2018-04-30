module.exports = {

    // Removes trailing /n
    rmn(str) {
        str = String(str);
        if (str[str.length - 1] == '\n') {
            return str.slice(0, -1);
        }
        else {
            return str;
        }
    }
};
