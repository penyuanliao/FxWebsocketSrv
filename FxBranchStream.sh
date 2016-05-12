#!/bin/bash

   echo '    ______    '
   echo '   / ____/ __ '
   echo '  / /__\ \/ / '
   echo ' / ___//   /  '  
   echo '/_/   /_/\_\  '  
   echo '              2016.05.11@Benson.liao'

configfile="./configfile/config.cfg";

NOW=$(date +"%Y%m%d");

export NODE_ENV='';
export DEBUG_FD=3;
export DEBUG="";

if [ -f "$configfile" ]
then
   source "$configfile"
else
   echo '### No such file or directory... ###'
   exit 0
fi
declare -i StreamCount=0;
SERV_PATH=""
for i in ${RTMP_STREAM_LIST[*]};
do
   if [ "$SERV_PATH" == "" ]
   then
      SERV_PATH="$RTMP_PATH:$RTMP_PORT${i}"
   else
      SERV_PATH="$SERV_PATH $RTMP_PATH:$RTMP_PORT${i}"
   fi

   StreamCount=$((StreamCount + 1))
done

read -p "Create Master FFMPEG Streaming media Server? (y or n ):" userArg1;

service=${userArg1:-"service"}

echo " + + NodeJS Server START. + + "

if [ "$service" == "y" ]
    then
        echo "+ + -broadcast Server + +"
        exec node ${SERV_PARAMS} ${SERV_BRANCH_FILE} -p ${SERV_PORT} -f "$SERV_PATH" -broadcast > "./${NOW}_broadcast.log" 2>&1 &
    else
        echo "+ + -middleware Server + +"
        exec node ${SERV_PARAMS} ${SERV_BRANCH_FILE} -p ${SERV_PORT} -f "$SERV_PATH" -middleware "$BRANCH_SOURCE_URL" > "./${NOW}_middleware.log" 2>&1 &
fi

echo " + Live Streaming connection connection: ${StreamCount}";

ps aux | grep node


