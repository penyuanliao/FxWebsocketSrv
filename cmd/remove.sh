#!/usr/bin/env bash
if [ $1 != "" ]
then
    pid=$(ps -aef | grep $1 | grep -v $0 | grep -v grep | awk '{print $2}');

    if [ $pid != "" ]
    then

    kill -9 $pid

    echo "kill PID:$pid successful";

    sleep .1
    ps $pid

    else

    echo "PID is NULL";

    fi

    isDel=$();


fi

#






