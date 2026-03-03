#!/bin/bash

#/**
# * @file install.sh
# * @brief install/update WebGrab+Plus
# * @author Francis De Paemeleere
# * @V1.0 ev updates Jan van Straaten
# * @date 04/01/2018
# */
#----------------------------------------------
# * V2.01 @ 11/08/2025
# * - reads install type from versiontype.txt (one word: normal, beta, eval)
#----------------------------------------------

# Go to the folder of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

TEMP_DIR=".temp"
INSTALL_TYPE_FILE="$TEMP_DIR/versiontype.txt"

# Read install type from versiontype.txt
if [ -f "$INSTALL_TYPE_FILE" ]; then
    install_type=$(cat "$INSTALL_TYPE_FILE" | tr -d '\r\n' | tr '[:upper:]' '[:lower:]')
else
    install_type=""
fi

echo "Detected install type: '$install_type'"

if [ "$install_type" = "normal" ] || [ "$install_type" = "beta" ]; then
    echo "Starting configuration file installation for type: $install_type"

    # mdb.config.xml
    if [ ! -f "mdb/mdb.config.xml" ] && [ -f "$TEMP_DIR/mdb.config.xml" ]; then
        echo " ==> Installing mdb/mdb.config.xml from .temp"
        cp "$TEMP_DIR/mdb.config.xml" "mdb/mdb.config.xml"
    else
        echo " ==> mdb/mdb.config.xml already exists, skipping"
    fi

    # rex.config.xml
    if [ ! -f "rex/rex.config.xml" ] && [ -f "$TEMP_DIR/rex.config.xml" ]; then
        echo " ==> Installing rex/rex.config.xml from .temp"
        cp "$TEMP_DIR/rex.config.xml" "rex/rex.config.xml"
    else
        echo " ==> rex/rex.config.xml already exists, skipping"
    fi

    # WebGrab++.config.xml
    if [ ! -f "WebGrab++.config.xml" ] && [ -f "$TEMP_DIR/WebGrab++.config.xml" ]; then
        echo " ==> Installing WebGrab++.config.xml from .temp"
        cp "$TEMP_DIR/WebGrab++.config.xml" "WebGrab++.config.xml"
    else
        echo " ==> WebGrab++.config.xml already exists, skipping"
    fi
elif [ "$install_type" = "eval" ]; then
    if [ ! -f "WebGrab++.config.xml" ]; then
        echo "Warning .. install type \"eval\" needs a prior \"normal\" or \"beta\" installation !"
    fi
    echo "No install actions required for install type: '$install_type'"
else
    echo "Unknown or missing install type: '$install_type'. No install actions performed."
fi

echo " ==> DONE"
exit 0