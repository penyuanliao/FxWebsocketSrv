#!/usr/bin/env bash

if [ $1 == "connect" ]
then
    netstat -an | grep :80 | grep ESTABLISHED | wc -l
fi

if [ $1 == "nodeInfo" ]
then
    
fi