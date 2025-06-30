#!/usr/bin/env python3

import os
import zipfile

dir = "d:/++++/-downloaded" 

print("dir = "+ dir)

for folders,subfolders,files in os.walk(dir):
    print("folders = " + folders)
    for file in files:
        print()
        if file.endswith(".txt") or file.endswith(".fb2"):
            newzipfile=zipfile.ZipFile(folders + "/" + file+".zip", mode='w', compression=zipfile.ZIP_DEFLATED, allowZip64=True, compresslevel=9)
            newzipfile.write(folders + "/" + file, arcname=file)
            #newzipfile.write(str(folders+"/"+file))
            print("file = '" + file + "'")

