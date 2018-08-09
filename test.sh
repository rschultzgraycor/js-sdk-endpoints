#!/bin/bash
cd lib
rm -rf *
cd ..
./endpoints lib -i index.ts -d endpoints -g
