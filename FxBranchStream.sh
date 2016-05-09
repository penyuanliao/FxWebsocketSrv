#!/bin/bash

   echo '    ______    '
   echo '   / ____/ __ '
   echo '  / /__\ \/ / '
   echo ' / ___//   /  '  
   echo '/_/   /_/\_\  '  
   echo '              @fxBrachStream.sh'

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

SERV_PATH=""
for i in ${RTMP_STREAM_LIST[*]};
do
   if [ "$SERV_PATH" == "" ]
   then
      SERV_PATH="$RTMP_PATH:$RTMP_PORT${i}"
   else
      SERV_PATH="$SERV_PATH $RTMP_PATH:$RTMP_PORT${i}"
   fi

done

exec node ${SERV_PARAMS} ${SERV_BRANCH_FILE} -p ${SERV_PORT} -v "$RTMP_PATH" -f "$SERV_PATH" > ./${NOW}.log 2>&1 &
echo " + + NodeJS Server START. + + "

echo "$SERV_PATH"




